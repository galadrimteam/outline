import type { Next } from "koa";
import Router from "koa-router";
import { uniq } from "es-toolkit/compat";
import { AuthenticationError } from "@server/errors";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { Database } from "@server/models";
import type { APIContext } from "@server/types";
import { safeEqual } from "@server/utils/crypto";
import { TeableEngine } from "../engine/teable/TeableEngine";
import { TeableMapper } from "../engine/teable/TeableMapper";
import env from "../env";
import { publishDatabaseChange } from "../utils/DatabaseChangePublisher";
import * as T from "./schema";

const router = new Router();

router.post(
  "teableHooks.receive",
  rateLimiter({ duration: 60, requests: 6000 }),
  verifyTeableSecret(),
  validate(T.TeableHooksReceiveSchema),
  async (ctx: APIContext<T.TeableHooksReceiveReq>) => {
    const { tableId, events, actor, origin } = ctx.input.body;
    const kinds = uniq(events.map((event) => event.kind));

    // A table moved into the Outline engine lives on there: what is still
    // written to it in Teable must not trigger automations or notifications.
    const onTeable = await Database.count({
      where: { externalTableId: tableId, engine: "teable" },
    });
    if (!onTeable) {
      ctx.body = { success: true };
      return;
    }

    if (kinds.includes("field")) {
      await TeableEngine.forgetFields(tableId);
    }

    const mapper = new TeableMapper();
    await publishDatabaseChange({
      tableId,
      kinds,
      recordIds: events.flatMap((event) => event.recordIds ?? []),
      fieldIds: events.flatMap((event) => event.fieldIds ?? []),
      viewIds: events.flatMap((event) => event.viewIds ?? []),
      changes: events
        .flatMap((event) => event.changes ?? [])
        .map((change) => ({
          recordId: change.recordId,
          fieldId: change.fieldId,
          before: mapper.cell(change.before),
          after: mapper.cell(change.after),
        })),
      actor: actor ? { email: actor.email } : null,
      origin,
    });

    ctx.body = { success: true };
  }
);

/**
 * Checks the bearer of a Teable webhook against the shared secret. The body
 * is not signed: koa-body does not keep the raw body.
 */
function verifyTeableSecret() {
  return async function verifyTeableSecretMiddleware(
    ctx: APIContext,
    next: Next
  ) {
    const header = ctx.request.get("authorization");
    const [scheme, token] = header.split(" ");
    if (
      !/^Bearer$/i.test(scheme ?? "") ||
      !safeEqual(env.GALADRIM_SECRET, token)
    ) {
      throw AuthenticationError("Invalid webhook secret");
    }
    return next();
  };
}

export default router;

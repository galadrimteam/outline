import type { Next } from "koa";
import Router from "koa-router";
import { uniq } from "es-toolkit/compat";
import type { DatabaseChangeKind } from "@shared/databases/types";
import { AuthenticationError } from "@server/errors";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { Database, Event, User } from "@server/models";
import type { APIContext, DatabaseCellChange } from "@server/types";
import { safeEqual } from "@server/utils/crypto";
import { TeableEngine } from "../engine/teable/TeableEngine";
import { TeableMapper } from "../engine/teable/TeableMapper";
import env from "../env";
import * as T from "./schema";

const router = new Router();

/** Above this many rows, readers reload the whole view instead. */
const maxRecordIds = 500;

/** Before/after values forwarded, for the row title sync. */
const maxChanges = 500;

router.post(
  "teableHooks.receive",
  rateLimiter({ duration: 60, requests: 6000 }),
  verifyTeableSecret(),
  validate(T.TeableHooksReceiveSchema),
  async (ctx: APIContext<T.TeableHooksReceiveReq>) => {
    const { tableId, events, actor, origin } = ctx.input.body;
    const kinds = uniq(events.map((event) => event.kind));

    if (kinds.includes("field")) {
      await TeableEngine.forgetFields(tableId);
    }

    // A table without a database (linked or looked up by one) is ignored.
    const databases = await Database.findAll({
      where: { externalTableId: tableId },
    });
    if (!databases.length) {
      ctx.body = { success: true };
      return;
    }

    const recordIds = uniq(events.flatMap((event) => event.recordIds ?? []));
    const mapper = new TeableMapper();
    const changes: DatabaseCellChange[] = events
      .flatMap((event) => event.changes ?? [])
      .slice(0, maxChanges)
      .map((change) => ({
        recordId: change.recordId,
        fieldId: change.fieldId,
        before: mapper.cell(change.before),
        after: mapper.cell(change.after),
      }));
    const data = {
      kinds: uniq<DatabaseChangeKind>(kinds),
      recordIds: recordIds.length <= maxRecordIds ? recordIds : undefined,
      fieldIds: uniq(events.flatMap((event) => event.fieldIds ?? [])),
      viewIds: uniq(events.flatMap((event) => event.viewIds ?? [])),
      origin: origin ?? null,
      changes,
    };

    const actorIdByTeam = await outlineActors(
      actor?.email,
      uniq(databases.map((database) => database.teamId))
    );

    await Promise.all(
      databases.map((database) =>
        Event.schedule({
          name: "databases.change",
          modelId: database.id,
          teamId: database.teamId,
          actorId: actorIdByTeam.get(database.teamId) ?? "",
          collectionId: database.collectionId,
          documentId: database.documentId,
          data,
        })
      )
    );

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

/** The Outline user behind a Teable user, in each team, matched by email. */
async function outlineActors(
  email: string | null | undefined,
  teamIds: string[]
): Promise<Map<string, string>> {
  if (!email) {
    return new Map();
  }
  const users = await User.findAll({
    attributes: ["id", "teamId"],
    where: { email: email.toLowerCase(), teamId: teamIds },
  });
  return new Map(users.map((user) => [user.teamId, user.id]));
}

export default router;

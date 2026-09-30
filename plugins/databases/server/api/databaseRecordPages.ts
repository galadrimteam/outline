import Router from "koa-router";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { Template } from "@server/models";
import { authorize } from "@server/policies";
import { presentDocument, presentPolicies } from "@server/presenters";
import type { APIContext } from "@server/types";
import { databaseRecordFromTemplateCreator } from "../commands/databaseRecordFromTemplateCreator";
import { engineFor } from "../engine";
import { presentDatabaseRecord } from "../presenters/databaseRecords";
import { actorFor } from "../utils/actor";
import { rowCommentCounts } from "../utils/rowCommentCounts";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
} from "../utils/routeHelpers";
import * as T from "./databaseRecordPagesSchema";

/** Routes about the pages of rows: their comments and their templates. */
const router = new Router();

router.post(
  "databaseRecords.commentCounts",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseRecordsCommentCountsSchema),
  async (ctx: APIContext<T.DatabaseRecordsCommentCountsReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, recordIds } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "read");

    ctx.body = { data: await rowCommentCounts(database, recordIds) };
  }
);

router.post(
  "databaseRecords.createFromTemplate",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsCreateFromTemplateSchema),
  async (ctx: APIContext<T.DatabaseRecordsCreateFromTemplateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, templateId, fields, order, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");
    const template = await Template.findByPk(templateId, { userId: user.id });
    authorize(user, "read", template);

    const { record, document } = await databaseRecordFromTemplateCreator(
      ctx.context,
      {
        user,
        database,
        template,
        engine: engineFor(database, { origin }),
        fields,
        order,
      }
    );

    ctx.body = {
      data: {
        record: await presentDatabaseRecord(database, record, actorFor(user)),
        document: await presentDocument(ctx, document),
      },
      policies: presentPolicies(user, [document]),
    };
  }
);

export default router;

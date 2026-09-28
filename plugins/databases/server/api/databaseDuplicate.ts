import Router from "koa-router";
import { ValidationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { Document } from "@server/models";
import { authorize } from "@server/policies";
import { presentPolicies } from "@server/presenters";
import type { APIContext } from "@server/types";
import { databasesDuplicator } from "../commands/databasesDuplicator";
import { engineFor, refFor } from "../engine";
import { presentDatabaseForUser } from "../presenters/database";
import { presentDatabaseSchema } from "../presenters/databaseSchema";
import { actorFor } from "../utils/actor";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
} from "../utils/routeHelpers";
import * as T from "./databaseDuplicateSchema";

const router = new Router();

router.post(
  "databases.duplicate",
  rateLimiter(DatabaseRateLimit.Create),
  auth({ optional: true }),
  validate(T.DatabasesDuplicateSchema),
  async (ctx: APIContext<T.DatabasesDuplicateReq>) => {
    const user = authenticatedUser(ctx);
    const { id, targetDocumentId, title, withRecords } = ctx.input.body;
    const source = await loadDatabase(user, id, "read");

    let collectionId = source.collectionId;
    let documentId = source.documentId;
    if (targetDocumentId) {
      const target = await Document.findByPk(targetDocumentId, {
        userId: user.id,
      });
      authorize(user, "update", target);
      if (!target.collectionId) {
        throw ValidationError("The document is not in a collection");
      }
      collectionId = target.collectionId;
      documentId = target.id;
    } else {
      authorize(user, "update", source);
    }

    const [copy] = await databasesDuplicator({
      user,
      duplications: [{ source, collectionId, documentId, title }],
      withRecords,
    });
    const { database } = copy;
    await database.loadAnchor(user.id);
    const schema = await engineFor(database).getSchema(
      actorFor(user),
      refFor(database)
    );

    ctx.body = {
      data: {
        database: presentDatabaseForUser(user, database),
        ...(await presentDatabaseSchema(database, schema)),
      },
      policies: presentPolicies(user, [database]),
    };
  }
);

export default router;

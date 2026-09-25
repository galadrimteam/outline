import Router from "koa-router";
import { Op } from "sequelize";
import { UserRole } from "@shared/types";
import { databaseRowsLinker } from "@server/commands/databaseRowDocumentCreator";
import { ValidationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Collection, Database, Document } from "@server/models";
import { authorize, can } from "@server/policies";
import { presentPolicies } from "@server/presenters";
import { QueryHelper } from "@server/storage/QueryHelper";
import type { APIContext } from "@server/types";
import { databaseCreator } from "../commands/databaseCreator";
import { ConvertTeableEmbedsTask } from "../tasks/ConvertTeableEmbedsTask";
import { engineFor, refFor } from "../engine";
import { presentDatabaseForUser } from "../presenters/database";
import { presentDatabaseSchema } from "../presenters/databaseSchema";
import { actorFor } from "../utils/actor";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
  lockDatabase,
} from "../utils/routeHelpers";
import * as T from "./schema";

const router = new Router();

router.post(
  "databases.info",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabasesInfoSchema),
  async (ctx: APIContext<T.DatabasesInfoReq>) => {
    const user = authenticatedUser(ctx);
    const database = await loadDatabase(user, ctx.input.body.id, "read");

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

router.post(
  "databases.list",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabasesListSchema),
  async (ctx: APIContext<T.DatabasesListReq>) => {
    const user = authenticatedUser(ctx);
    const { collectionId, query, offset, limit } = ctx.input.body;

    let collectionIds: string[];
    if (collectionId) {
      const collection = await Collection.findByPk(collectionId, {
        userId: user.id,
      });
      authorize(user, "readDocument", collection);
      collectionIds = [collectionId];
    } else {
      collectionIds = await user.collectionIds();
    }

    const databases = await Database.findAll({
      where: {
        teamId: user.teamId,
        collectionId: collectionIds,
        ...(query
          ? { title: { [Op.iLike]: QueryHelper.likeContains(query) } }
          : {}),
      },
      order: [
        ["title", "ASC"],
        ["id", "ASC"],
      ],
      offset,
      limit,
    });
    await Promise.all(
      databases.map((database) => database.loadAnchor(user.id))
    );
    const readable = databases.filter((database) =>
      can(user, "read", database)
    );

    ctx.body = {
      pagination: { offset, limit },
      data: readable.map((database) => presentDatabaseForUser(user, database)),
      policies: presentPolicies(user, readable),
    };
  }
);

router.post(
  "databases.create",
  rateLimiter(DatabaseRateLimit.Create),
  auth({ optional: true }),
  validate(T.DatabasesCreateSchema),
  async (ctx: APIContext<T.DatabasesCreateReq>) => {
    const user = authenticatedUser(ctx);
    const { collectionId, documentId, title, layout } = ctx.input.body;

    const collection = await Collection.findByPk(collectionId, {
      userId: user.id,
    });
    let document: Document | null = null;
    if (documentId) {
      document = await Document.findByPk(documentId, { userId: user.id });
      authorize(user, "update", document);
      if (document.collectionId !== collectionId) {
        throw ValidationError("The document is not in this collection");
      }
      authorize(user, "readDocument", collection);
    } else {
      authorize(user, "createDocument", collection);
    }

    const { database, fields, views } = await databaseCreator({
      user,
      collection,
      document,
      title,
      layout,
      engine: engineFor({ engine: "teable" }),
    });
    await database.loadAnchor(user.id);

    ctx.body = {
      data: { database: presentDatabaseForUser(user, database), fields, views },
      policies: presentPolicies(user, [database]),
    };
  }
);

router.post(
  "databases.register",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ role: UserRole.Admin }),
  validate(T.DatabasesRegisterSchema),
  transaction(),
  async (ctx: APIContext<T.DatabasesRegisterReq>) => {
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const { collectionId, documentId, externalBaseId, externalTableId, title } =
      ctx.input.body;

    const collection = await Collection.findByPk(collectionId, {
      userId: user.id,
      transaction,
    });
    authorize(user, "update", collection);
    if (documentId) {
      const document = await Document.findByPk(documentId, {
        userId: user.id,
        transaction,
      });
      authorize(user, "read", document);
      if (document.collectionId !== collectionId) {
        throw ValidationError("The document is not in this collection");
      }
    }

    const ref = { externalBaseId, externalTableId };
    const engine = engineFor({ engine: "teable" });
    const info = await engine.describeTable("system", ref);

    const [database] = await Database.findOrCreate({
      where: { teamId: user.teamId, externalTableId },
      defaults: {
        teamId: user.teamId,
        collectionId,
        documentId: documentId ?? null,
        title: title || info.name,
        engine: "teable",
        externalBaseId,
        externalTableId,
        settings: {},
        createdById: user.id,
      },
      transaction,
    });
    database.collectionId = collectionId;
    database.documentId = documentId ?? null;
    database.externalBaseId = externalBaseId;
    if (title) {
      database.title = title;
    }
    await database.save({ transaction });
    await database.loadAnchor(user.id, { transaction });

    ctx.body = {
      data: presentDatabaseForUser(user, database),
      policies: presentPolicies(user, [database]),
    };
  }
);

router.post(
  "databases.update",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabasesUpdateSchema),
  transaction(),
  async (ctx: APIContext<T.DatabasesUpdateReq>) => {
    const user = authenticatedUser(ctx);
    const { transaction } = ctx.state;
    const { id, title, icon, settings } = ctx.input.body;

    const loaded = await loadDatabase(user, id, "update", { transaction });
    const database = await lockDatabase(loaded, transaction);
    if (title !== undefined) {
      database.title = title;
    }
    if (icon !== undefined) {
      database.icon = icon;
    }
    if (settings) {
      database.settings = DatabaseSettingsHelper.merge(
        database.settings,
        settings
      );
      database.changed("settings", true);
    }
    await database.save({ transaction });
    database.document = loaded.document;
    database.collection = loaded.collection;

    ctx.body = {
      data: presentDatabaseForUser(user, database),
      policies: presentPolicies(user, [database]),
    };
  }
);

router.post(
  "databases.delete",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabasesDeleteSchema),
  transaction(),
  async (ctx: APIContext<T.DatabasesDeleteReq>) => {
    const user = authenticatedUser(ctx);
    const { transaction } = ctx.state;
    const database = await loadDatabase(user, ctx.input.body.id, "delete", {
      transaction,
    });

    await database.destroy({ transaction });

    ctx.body = { success: true };
  }
);

router.post(
  "databases.linkRows",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ role: UserRole.Admin }),
  validate(T.DatabasesLinkRowsSchema),
  transaction(),
  async (ctx: APIContext<T.DatabasesLinkRowsReq>) => {
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const { id, pairs } = ctx.input.body;

    const database = await loadDatabase(user, id, "update", { transaction });
    const linked = await databaseRowsLinker(ctx.context, { database, pairs });

    ctx.body = { data: { linked } };
  }
);

router.post(
  "databases.convertEmbeds",
  rateLimiter(DatabaseRateLimit.Create),
  auth({ role: UserRole.Admin }),
  validate(T.DatabasesConvertEmbedsSchema),
  async (ctx: APIContext<T.DatabasesConvertEmbedsReq>) => {
    const { user } = ctx.state.auth;
    const { documentId, collectionId, dryRun } = ctx.input.body;

    if (documentId) {
      const document = await Document.findByPk(documentId, {
        userId: user.id,
      });
      authorize(user, "update", document);
    }
    if (collectionId) {
      const collection = await Collection.findByPk(collectionId, {
        userId: user.id,
      });
      authorize(user, "update", collection);
    }

    const props = {
      teamId: user.teamId,
      documentId,
      collectionId,
      dryRun,
      actorId: user.id,
    };
    if (dryRun) {
      ctx.body = { data: await new ConvertTeableEmbedsTask().perform(props) };
      return;
    }
    await new ConvertTeableEmbedsTask().schedule(props);
    ctx.body = { success: true };
  }
);

export default router;

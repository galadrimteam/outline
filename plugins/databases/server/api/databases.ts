import Router from "koa-router";
import { Op } from "sequelize";
import { UserRole } from "@shared/types";
import { toError } from "@shared/utils/error";
import { databaseRowsLinker } from "@server/commands/databaseRowDocumentCreator";
import { databaseRowsTreeUpdater } from "@server/commands/databaseRowsTreeUpdater";
import { NotFoundError, ValidationError } from "@server/errors";
import Logger from "@server/logging/Logger";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import {
  Collection,
  Database,
  DatabaseAutomation,
  Document,
} from "@server/models";
import { authorize, can } from "@server/policies";
import { presentDatabase, presentPolicies } from "@server/presenters";
import { QueryHelper } from "@server/storage/QueryHelper";
import type { APIContext } from "@server/types";
import { databaseCreator } from "../commands/databaseCreator";
import { importedDatabaseTitlesFixer } from "../commands/importedDatabaseTitlesFixer";
import { importedRowPagesCleaner } from "../commands/importedRowPagesCleaner";
import { engineFor, refFor } from "../engine";
import { engineOfTable } from "../utils/tableEngine";
import env from "../env";
import { ConvertTeableEmbedsTask } from "../tasks/ConvertTeableEmbedsTask";
import { MoveDatabaseEngineTask } from "../tasks/MoveDatabaseEngineTask";
import { presentDatabaseForUser } from "../presenters/database";
import { presentDatabaseSchema } from "../presenters/databaseSchema";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";
import { loadDatabaseForRead } from "../utils/shareAccess";
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
    const { id, shareId } = ctx.input.body;
    const access = await loadDatabaseForRead(ctx, id, shareId);
    const { database, user } = access;

    const schema = await engineFor(database).getSchema(
      access.actor,
      refFor(database)
    );

    // Editors see Notion's ⚡ in the toolbar while automations are on.
    const automationCount =
      user && !access.shareId && can(user, "update", database)
        ? await DatabaseAutomation.count({
            where: { databaseId: database.id, enabled: true },
          })
        : undefined;

    ctx.body = {
      data: {
        database:
          user && !access.shareId
            ? { ...presentDatabaseForUser(user, database), automationCount }
            : presentDatabase(database),
        ...(await presentDatabaseSchema(database, schema)),
      },
      policies:
        user && !access.shareId ? presentPolicies(user, [database]) : undefined,
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
    const engineName = await engineOfTable(user.teamId, externalTableId);
    if (engineName === "teable") {
      requireTeable();
    }

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
    const engine = engineFor({ engine: engineName, teamId: user.teamId });
    const info = await engine.describeTable("system", ref);

    const [database] = await Database.findOrCreate({
      where: { teamId: user.teamId, externalTableId },
      defaults: {
        teamId: user.teamId,
        collectionId,
        documentId: documentId ?? null,
        title: title || info.name,
        engine: engineName,
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
    const rowsWereInSidebar = database.rowsInSidebar;
    if (settings) {
      database.settings = DatabaseSettingsHelper.merge(
        database.settings,
        settings
      );
      database.changed("settings", true);
    }
    await database.save({ transaction });
    if (database.rowsInSidebar !== rowsWereInSidebar) {
      await databaseRowsTreeUpdater(database, { transaction });
    }
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
    // The properties panel now shows what the migration had written on top of each page.
    transaction.afterCommit(async () => {
      await importedRowPagesCleaner(user, database, {
        documentIds: pairs.map((pair) => pair.documentId),
      }).catch((error) =>
        Logger.warn("Could not clean the row pages just linked", {
          databaseId: database.id,
          error: toError(error).message,
        })
      );
    });

    ctx.body = { data: { linked } };
  }
);

router.post(
  "databases.cleanRowPages",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ role: UserRole.Admin }),
  validate(T.DatabasesCleanRowPagesSchema),
  async (ctx: APIContext<T.DatabasesCleanRowPagesReq>) => {
    const { user } = ctx.state.auth;
    const { id, dryRun, offset, limit } = ctx.input.body;

    const database = await loadDatabase(user, id, "update");

    ctx.body = {
      data: await importedRowPagesCleaner(user, database, {
        dryRun,
        offset,
        limit,
      }),
    };
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

router.post(
  "databases.fixImportedTitles",
  rateLimiter(DatabaseRateLimit.Create),
  auth({ role: UserRole.Admin }),
  validate(T.DatabasesFixImportedTitlesSchema),
  async (ctx: APIContext<T.DatabasesFixImportedTitlesReq>) => {
    const { user } = ctx.state.auth;
    const { collectionId, dryRun } = ctx.input.body;

    if (collectionId) {
      const collection = await Collection.findByPk(collectionId, {
        userId: user.id,
      });
      authorize(user, "update", collection);
    }

    ctx.body = {
      data: await importedDatabaseTitlesFixer(user, { collectionId, dryRun }),
    };
  }
);

router.post(
  "databases.moveToOutlineEngine",
  rateLimiter(DatabaseRateLimit.Create),
  auth({ role: UserRole.Admin }),
  validate(T.DatabasesMoveToOutlineEngineSchema),
  async (ctx: APIContext<T.DatabasesMoveToOutlineEngineReq>) => {
    const { user } = ctx.state.auth;
    const { id, dryRun } = ctx.input.body;
    requireTeable();

    const database = await Database.findOne({
      where: { id, teamId: user.teamId },
    });
    if (!database) {
      throw NotFoundError("Database not found");
    }
    if (database.engine !== "teable") {
      throw ValidationError("This database is not on Teable");
    }

    const props = { databaseId: database.id, actorId: user.id, dryRun };
    // A dry run only reads, and answers; a move copies files and outlasts a
    // request, so it runs in the worker and logs its result.
    if (dryRun) {
      ctx.body = { data: await new MoveDatabaseEngineTask().perform(props) };
      return;
    }
    await new MoveDatabaseEngineTask().schedule(props);
    ctx.body = { success: true };
  }
);

/**
 * Refuses a route that reads Teable on a server without Teable.
 *
 * @throws ValidationError when Teable is not configured.
 */
function requireTeable() {
  if (!env.isTeableConfigured) {
    throw ValidationError("Teable is not configured on this server");
  }
}

export default router;

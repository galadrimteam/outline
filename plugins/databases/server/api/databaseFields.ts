import Router from "koa-router";
import type { DatabaseFieldOptions } from "@shared/databases/types";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import type { Database, User } from "@server/models";
import type { APIContext } from "@server/types";
import { engineFor, refFor } from "../engine";
import { presentDatabaseField } from "../presenters/databaseSchema";
import { actorFor } from "../utils/actor";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
  updateDatabaseSettings,
} from "../utils/routeHelpers";
import * as T from "./schema";

const router = new Router();

router.post(
  "databaseFields.create",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseFieldsCreateSchema),
  async (ctx: APIContext<T.DatabaseFieldsCreateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, name, type, options, viewId, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const field = await engineFor(database, { origin }).createField(
      actorFor(user),
      refFor(database),
      {
        name,
        type,
        options: await engineFieldOptions(user, database, options),
        viewId,
      }
    );

    ctx.body = { data: await presentDatabaseField(database, field) };
  }
);

router.post(
  "databaseFields.update",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseFieldsUpdateSchema),
  async (ctx: APIContext<T.DatabaseFieldsUpdateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, fieldId, name, description, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const field = await engineFor(database, { origin }).updateField(
      actorFor(user),
      refFor(database),
      fieldId,
      { name, description }
    );

    ctx.body = { data: await presentDatabaseField(database, field) };
  }
);

router.post(
  "databaseFields.convert",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseFieldsConvertSchema),
  async (ctx: APIContext<T.DatabaseFieldsConvertReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, fieldId, type, options, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const field = await engineFor(database, { origin }).convertField(
      actorFor(user),
      refFor(database),
      fieldId,
      { type, options: await engineFieldOptions(user, database, options) }
    );

    ctx.body = { data: await presentDatabaseField(database, field) };
  }
);

router.post(
  "databaseFields.duplicate",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseFieldsDuplicateSchema),
  async (ctx: APIContext<T.DatabaseFieldsDuplicateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, fieldId, name, viewId, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const field = await engineFor(database, { origin }).duplicateField(
      actorFor(user),
      refFor(database),
      fieldId,
      { name, viewId }
    );
    const meta = database.settings?.fieldMeta?.[fieldId];
    if (meta) {
      await updateDatabaseSettings(database, (settings) =>
        DatabaseSettingsHelper.merge(settings, {
          fieldMeta: { [field.id]: meta },
        })
      );
    }

    ctx.body = { data: await presentDatabaseField(database, field) };
  }
);

router.post(
  "databaseFields.delete",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseFieldsDeleteSchema),
  async (ctx: APIContext<T.DatabaseFieldsDeleteReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, fieldId, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    await engineFor(database, { origin }).deleteField(
      actorFor(user),
      refFor(database),
      fieldId
    );
    await updateDatabaseSettings(database, (settings) =>
      DatabaseSettingsHelper.withoutField(settings, fieldId)
    );

    ctx.body = { success: true };
  }
);

/**
 * Turns the Outline database a link field targets into the engine table,
 * checking that the user can read it. The engine table never comes from the
 * client.
 */
async function engineFieldOptions(
  user: User,
  database: Database,
  options: DatabaseFieldOptions | undefined
): Promise<DatabaseFieldOptions | undefined> {
  if (!options?.foreignDatabaseId) {
    return options;
  }
  const { foreignDatabaseId, ...rest } = options;
  const target = await loadDatabase(user, foreignDatabaseId, "read");
  return {
    ...rest,
    foreignTableId: target.externalTableId,
    ...(target.externalBaseId !== database.externalBaseId
      ? { baseId: target.externalBaseId }
      : {}),
  };
}

export default router;

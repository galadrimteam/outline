import Router from "koa-router";
import type {
  DatabaseViewOptions,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import type { APIContext } from "@server/types";
import { engineFor, refFor } from "../engine";
import { actorFor } from "../utils/actor";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";
import { isOverlayLayout, viewTypeForLayout } from "../utils/layouts";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
  updateDatabaseSettings,
} from "../utils/routeHelpers";
import * as T from "./schema";

const router = new Router();

router.post(
  "databaseViews.create",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseViewsCreateSchema),
  async (ctx: APIContext<T.DatabaseViewsCreateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, name, layout, options, overrides, origin } =
      ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");
    const engine = engineFor(database, { origin });
    const actor = actorFor(user);
    const ref = refFor(database);

    const viewOptions: DatabaseViewOptions = { ...options };
    if (layout === DatabaseLayout.Board && !viewOptions.stackFieldId) {
      const { fields } = await engine.getSchema(actor, ref);
      viewOptions.stackFieldId = (
        fields.find((field) => field.type === DatabaseFieldType.SingleSelect) ??
        fields.find((field) => field.type === DatabaseFieldType.User)
      )?.id;
    }

    const view = await engine.createView(actor, ref, {
      name,
      type: viewTypeForLayout(layout),
      options: Object.keys(viewOptions).length ? viewOptions : undefined,
    });

    const viewOverrides: DatabaseViewOverrides = { ...overrides };
    if (isOverlayLayout(layout)) {
      viewOverrides.layout = layout;
    }
    if (Object.keys(viewOverrides).length) {
      await updateDatabaseSettings(database, (settings) =>
        DatabaseSettingsHelper.mergeViewOverrides(
          settings,
          view.id,
          viewOverrides
        )
      );
    }

    ctx.body = {
      data: DatabaseSettingsHelper.applyToView(view, database.settings),
    };
  }
);

router.post(
  "databaseViews.update",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseViewsUpdateSchema),
  async (ctx: APIContext<T.DatabaseViewsUpdateReq>) => {
    const user = authenticatedUser(ctx);
    const {
      databaseId,
      viewId,
      name,
      description,
      filter,
      sort,
      group,
      columnMeta,
      options,
      overrides,
      isLocked,
      origin,
    } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const view = await engineFor(database, { origin }).updateView(
      actorFor(user),
      refFor(database),
      viewId,
      { name, description, filter, sort, group, columnMeta, options, isLocked }
    );
    if (overrides && Object.keys(overrides).length) {
      await updateDatabaseSettings(database, (settings) =>
        DatabaseSettingsHelper.mergeViewOverrides(settings, view.id, overrides)
      );
    }

    ctx.body = {
      data: DatabaseSettingsHelper.applyToView(view, database.settings),
    };
  }
);

router.post(
  "databaseViews.delete",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseViewsDeleteSchema),
  async (ctx: APIContext<T.DatabaseViewsDeleteReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, viewId, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    await engineFor(database, { origin }).deleteView(
      actorFor(user),
      refFor(database),
      viewId
    );
    if (database.settings?.viewOverrides?.[viewId]) {
      await updateDatabaseSettings(database, (settings) =>
        DatabaseSettingsHelper.withoutView(settings, viewId)
      );
    }

    ctx.body = { success: true };
  }
);

router.post(
  "databaseViews.duplicate",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseViewsDuplicateSchema),
  async (ctx: APIContext<T.DatabaseViewsDuplicateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, viewId, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const view = await engineFor(database, { origin }).duplicateView(
      actorFor(user),
      refFor(database),
      viewId
    );
    const sourceOverrides = database.settings?.viewOverrides?.[viewId];
    if (sourceOverrides) {
      await updateDatabaseSettings(database, (settings) =>
        DatabaseSettingsHelper.merge(settings, {
          viewOverrides: { [view.id]: sourceOverrides },
        })
      );
    }

    ctx.body = {
      data: DatabaseSettingsHelper.applyToView(view, database.settings),
    };
  }
);

router.post(
  "databaseViews.reorder",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseViewsReorderSchema),
  async (ctx: APIContext<T.DatabaseViewsReorderReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, viewId, anchorId, position, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const views = await engineFor(database, { origin }).reorderView(
      actorFor(user),
      refFor(database),
      viewId,
      { anchorId, position }
    );

    ctx.body = {
      data: views.map((view) =>
        DatabaseSettingsHelper.applyToView(view, database.settings)
      ),
    };
  }
);

export default router;

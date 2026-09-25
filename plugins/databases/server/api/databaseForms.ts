import Router from "koa-router";
import type { DatabaseField, DatabaseView } from "@shared/databases/types";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@server/errors";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import type { Database, User } from "@server/models";
import { can } from "@server/policies";
import type { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import type { DatabaseActor } from "../engine/DatabaseEngine";
import { engineFor, refFor } from "../engine";
import { formAnswers } from "../forms/formAnswers";
import type { FormAudience } from "../forms/formDefinition";
import { formDefinition, formQuestions } from "../forms/formDefinition";
import type { FormSettings } from "../forms/formSharing";
import {
  findPublicForm,
  formSettingsOf,
  presentFormSharing,
  withFormSharing,
} from "../forms/formSharing";
import { actorFor } from "../utils/actor";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";
import { DatabaseUserMapper } from "../utils/DatabaseUserMapper";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
  updateDatabaseSettings,
} from "../utils/routeHelpers";
import * as T from "./formSchema";

const router = new Router();

router.post(
  "databaseForms.info",
  rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
  auth({ optional: true }),
  validate(T.DatabaseFormsInfoSchema),
  async (ctx: APIContext<T.DatabaseFormsInfoReq>) => {
    const form = await resolveForm(ctx.state.auth.user, ctx.input.body);

    ctx.body = {
      data: formDefinition(
        form.database,
        form.view,
        form.fields,
        form.settings,
        form.audience
      ),
    };
  }
);

router.post(
  "databaseForms.submit",
  rateLimiter(RateLimiterStrategy.TenPerMinute),
  auth({ optional: true }),
  validate(T.DatabaseFormsSubmitSchema),
  async (ctx: APIContext<T.DatabaseFormsSubmitReq>) => {
    const { fields, website } = ctx.input.body;
    const form = await resolveForm(ctx.state.auth.user, ctx.input.body);
    if (!form.audience.canSubmit) {
      throw form.member
        ? AuthorizationError("You may not submit this form")
        : AuthenticationError("Sign in to fill in this form");
    }
    // A robot filled the hidden input: it is told the answer was taken.
    if (website) {
      ctx.body = { success: true };
      return;
    }

    const answers = formAnswers(
      formQuestions(form.fields, form.view, form.audience.allowPeople),
      fields
    );
    const { database } = form;
    const engine = engineFor(database, { origin: `form:${form.view.id}` });
    const actor: DatabaseActor = form.member ? actorFor(form.member) : "system";
    await engine.createRecord(actor, refFor(database), {
      fields: await DatabaseUserMapper.resolveInputs(
        engine,
        database.teamId,
        answers
      ),
    });

    ctx.body = { success: true };
  }
);

router.post(
  "databaseForms.share",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseFormsShareSchema),
  async (ctx: APIContext<T.DatabaseFormsShareReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, viewId, ...patch } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");
    await formView(database, viewId, actorFor(user));

    const settings = await updateDatabaseSettings(database, (current) =>
      withFormSharing(current, viewId, patch)
    );

    ctx.body = {
      data: presentFormSharing(viewId, formSettingsOf(settings, viewId)),
    };
  }
);

/** A form, who fills it and what they may do with it. */
interface ResolvedForm {
  database: Database;
  view: DatabaseView;
  fields: DatabaseField[];
  settings: FormSettings;
  audience: FormAudience;
  /** The signed-in person when a member of the database's team. */
  member: User | null;
}

async function resolveForm(
  user: User | undefined,
  ref: { slug?: string; databaseId?: string; viewId?: string }
): Promise<ResolvedForm> {
  if (ref.slug) {
    const located = await findPublicForm(ref.slug);
    if (!located) {
      throw NotFoundError("This form does not exist or is no longer shared");
    }
    const { database, viewId, settings } = located;
    const member =
      user && user.teamId === database.teamId && !user.isSuspended
        ? user
        : null;
    const { view, fields } = await formView(database, viewId, "system");
    return {
      database,
      view,
      fields,
      settings,
      member,
      audience: {
        canSubmit: !settings.requireLogin || !!member,
        allowPeople: !!member,
      },
    };
  }

  if (!user) {
    throw AuthenticationError("Authentication required");
  }
  if (!ref.databaseId || !ref.viewId) {
    throw ValidationError("slug or databaseId and viewId are required");
  }
  const database = await loadDatabase(user, ref.databaseId, "read");
  const { view, fields } = await formView(database, ref.viewId, actorFor(user));
  return {
    database,
    view,
    fields,
    settings: formSettingsOf(database.settings, view.id),
    member: user,
    audience: {
      canSubmit: !!can(user, "update", database),
      allowPeople: true,
    },
  };
}

async function formView(
  database: Database,
  viewId: string,
  actor: DatabaseActor
): Promise<{ view: DatabaseView; fields: DatabaseField[] }> {
  const schema = await engineFor(database).getSchema(actor, refFor(database));
  const view = schema.views.find(
    (item) => item.id === viewId && item.type === "form"
  );
  if (!view) {
    throw NotFoundError("This form does not exist or is no longer shared");
  }
  return {
    view: DatabaseSettingsHelper.applyToView(view, database.settings),
    fields: schema.fields,
  };
}

export default router;

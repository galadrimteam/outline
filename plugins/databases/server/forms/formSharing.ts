import { randomBytes } from "node:crypto";
import { Op, literal } from "sequelize";
import type { DatabaseFormSharing } from "@shared/databases/forms";
import type {
  DatabaseSettings,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import { Database } from "@server/models";
import { sequelize } from "@server/storage/database";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";

/** How a form view is shared, kept in the view's overrides. */
export type FormSettings = NonNullable<DatabaseViewOverrides["form"]>;

/** The changes to the sharing of a form. */
export interface FormSharingPatch {
  public?: boolean;
  requireLogin?: boolean;
  successMessage?: string | null;
  /** Replaces the public address, so that the old one stops working. */
  resetLink?: boolean;
}

/** A form found by its public address. */
export interface LocatedForm {
  database: Database;
  viewId: string;
  settings: FormSettings;
}

/**
 * Finds the public form behind an address. Only a form whose sharing is on is
 * found; a slug copied by duplicating a view resolves to the oldest database.
 *
 * @param slug the slug of the address `/f/<slug>`.
 * @returns the database, the form view and its sharing, or null.
 */
export async function findPublicForm(
  slug: string
): Promise<LocatedForm | null> {
  const databases = await Database.findAll({
    where: {
      [Op.and]: [
        literal(
          `jsonb_path_exists("settings", '$.viewOverrides.*.form ? (@.slug == $slug && @.public == true)', jsonb_build_object('slug', ${sequelize.escape(slug)}::text))`
        ),
      ],
    },
    order: [["createdAt", "ASC"]],
  });
  for (const database of databases) {
    for (const [viewId, overrides] of Object.entries(
      database.settings?.viewOverrides ?? {}
    )) {
      if (overrides.form?.public && overrides.form.slug === slug) {
        return { database, viewId, settings: overrides.form };
      }
    }
  }
  return null;
}

/**
 * Returns the sharing of a form view from the database's settings.
 *
 * @param settings the database's settings.
 * @param viewId the form view.
 * @returns the form's settings, empty when never shared.
 */
export function formSettingsOf(
  settings: DatabaseSettings | null | undefined,
  viewId: string
): FormSettings {
  return settings?.viewOverrides?.[viewId]?.form ?? {};
}

/**
 * Applies a change of sharing to the database's settings. A form gets its
 * unguessable address the first time it is made public.
 *
 * @param settings the current settings.
 * @param viewId the form view.
 * @param patch the change.
 * @returns the new settings.
 */
export function withFormSharing(
  settings: DatabaseSettings,
  viewId: string,
  patch: FormSharingPatch
): DatabaseSettings {
  const overrides = settings.viewOverrides?.[viewId] ?? {};
  const form: FormSettings = { ...overrides.form };
  if (patch.public !== undefined) {
    form.public = patch.public;
  }
  if (patch.requireLogin !== undefined) {
    form.requireLogin = patch.requireLogin;
  }
  if (patch.successMessage !== undefined) {
    if (patch.successMessage) {
      form.successMessage = patch.successMessage;
    } else {
      delete form.successMessage;
    }
  }
  if (patch.resetLink || (form.public && !form.slug)) {
    form.slug = newSlug();
  }
  return DatabaseSettingsHelper.merge(settings, {
    viewOverrides: { [viewId]: { ...overrides, form } },
  });
}

/**
 * Presents the sharing of a form view.
 *
 * @param viewId the form view.
 * @param form the form's settings.
 * @returns the sharing.
 */
export function presentFormSharing(
  viewId: string,
  form: FormSettings
): DatabaseFormSharing {
  return {
    viewId,
    public: !!form.public,
    requireLogin: !!form.requireLogin,
    slug: form.slug ?? null,
    successMessage: form.successMessage ?? null,
    url: form.public && form.slug ? `/f/${form.slug}` : null,
  };
}

function newSlug(): string {
  return randomBytes(12).toString("base64url");
}

import type {
  DatabaseField,
  DatabaseFieldMeta,
  DatabaseGroupLayout,
  DatabaseSettings,
  DatabaseView,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import type { DatabaseSchema } from "../engine/DatabaseEngine";

/** A settings patch: a null entry of `viewOverrides` or `fieldMeta` removes it. */
export interface DatabaseSettingsPatch {
  viewOverrides?: Record<string, DatabaseViewOverrides | null>;
  fieldMeta?: Record<string, DatabaseFieldMeta | null>;
  pageLayout?: DatabaseSettings["pageLayout"] | null;
  iconFieldId?: string | null;
  subItemFieldId?: string | null;
}

/**
 * What Outline keeps next to the engine's schema (`databases.settings`), and
 * how it is merged into the schema the app sees.
 */
export class DatabaseSettingsHelper {
  /**
   * Applies Outline's overrides to an engine schema: `viewOverrides` become
   * each view's `overrides` (and `layout`, when overridden), `fieldMeta`
   * becomes each field's `meta`.
   *
   * @param schema the engine schema.
   * @param settings the database's settings.
   * @returns the schema the app sees.
   */
  public static applyToSchema(
    schema: DatabaseSchema,
    settings: DatabaseSettings | null | undefined
  ): DatabaseSchema {
    return {
      fields: schema.fields.map((field) => this.applyToField(field, settings)),
      views: schema.views.map((view) => this.applyToView(view, settings)),
    };
  }

  /**
   * Applies Outline's overrides to one view.
   *
   * @param view the engine view.
   * @param settings the database's settings.
   * @returns the view with its overrides.
   */
  public static applyToView(
    view: DatabaseView,
    settings: DatabaseSettings | null | undefined
  ): DatabaseView {
    const overrides = settings?.viewOverrides?.[view.id] ?? {};
    return {
      ...view,
      overrides,
      layout: overrides.layout ?? view.layout,
    };
  }

  /**
   * Returns the order and the folded groups a view gives its groups (its
   * `stackOrder` and `hiddenStacks`), for the engine to read the view's rows.
   *
   * @param settings the database's settings.
   * @param viewId the view, if any.
   * @returns the group layout, undefined when the view gives none.
   */
  public static groupLayout(
    settings: DatabaseSettings | null | undefined,
    viewId: string | undefined
  ): DatabaseGroupLayout | undefined {
    const overrides = viewId ? settings?.viewOverrides?.[viewId] : undefined;
    if (!overrides?.stackOrder?.length && !overrides?.hiddenStacks?.length) {
      return undefined;
    }
    return { order: overrides.stackOrder, hidden: overrides.hiddenStacks };
  }

  /**
   * Applies Outline's metadata to one field.
   *
   * @param field the engine field.
   * @param settings the database's settings.
   * @returns the field with its metadata.
   */
  public static applyToField(
    field: DatabaseField,
    settings: DatabaseSettings | null | undefined
  ): DatabaseField {
    const meta = settings?.fieldMeta?.[field.id];
    return meta ? { ...field, meta } : field;
  }

  /**
   * Merges a patch into settings. Top-level keys are replaced; entries of
   * `viewOverrides` and `fieldMeta` are replaced one by one, null removes one;
   * keys of `pageLayout` are replaced one by one, a null `pageLayout` removes it.
   *
   * @param settings the current settings.
   * @param patch the changes.
   * @returns the new settings.
   */
  public static merge(
    settings: DatabaseSettings | null | undefined,
    patch: DatabaseSettingsPatch
  ): DatabaseSettings {
    const next: DatabaseSettings = { ...settings };
    if (patch.viewOverrides) {
      const current = next.viewOverrides;
      next.viewOverrides = mergeEntries(current, patch.viewOverrides);
      // A form's sharing is only changed through databaseForms.share.
      for (const [viewId, entry] of Object.entries(patch.viewOverrides)) {
        const form = current?.[viewId]?.form;
        if (entry && form && !("form" in entry)) {
          next.viewOverrides[viewId] = { ...entry, form };
        }
      }
    }
    if (patch.fieldMeta) {
      next.fieldMeta = mergeEntries(next.fieldMeta, patch.fieldMeta);
    }
    if (patch.pageLayout !== undefined) {
      if (patch.pageLayout === null) {
        delete next.pageLayout;
      } else {
        next.pageLayout = { ...next.pageLayout, ...patch.pageLayout };
      }
    }
    if (patch.iconFieldId !== undefined) {
      if (patch.iconFieldId === null) {
        delete next.iconFieldId;
      } else {
        next.iconFieldId = patch.iconFieldId;
      }
    }
    if (patch.subItemFieldId !== undefined) {
      if (patch.subItemFieldId === null) {
        delete next.subItemFieldId;
      } else {
        next.subItemFieldId = patch.subItemFieldId;
      }
    }
    return next;
  }

  /**
   * Forgets what Outline kept about a deleted field.
   *
   * @param settings the current settings.
   * @param fieldId the deleted field.
   * @returns the new settings.
   */
  public static withoutField(
    settings: DatabaseSettings | null | undefined,
    fieldId: string
  ): DatabaseSettings {
    const next = this.merge(settings, {
      fieldMeta: { [fieldId]: null },
      ...(settings?.iconFieldId === fieldId ? { iconFieldId: null } : {}),
      ...(settings?.subItemFieldId === fieldId ? { subItemFieldId: null } : {}),
    });
    if (next.pageLayout) {
      const layout = next.pageLayout;
      const without = (ids: string[] | undefined) =>
        ids?.filter((id) => id !== fieldId);
      next.pageLayout = {
        ...layout,
        hiddenFieldIds: without(layout.hiddenFieldIds),
        hideWhenEmptyFieldIds: without(layout.hideWhenEmptyFieldIds),
        fieldOrder: without(layout.fieldOrder),
        pinnedFieldIds: without(layout.pinnedFieldIds),
        tabs: layout.tabs?.filter((tab) => tab.fieldId !== fieldId),
      };
    }
    return next;
  }

  /**
   * Forgets what Outline kept about a deleted view.
   *
   * @param settings the current settings.
   * @param viewId the deleted view.
   * @returns the new settings.
   */
  public static withoutView(
    settings: DatabaseSettings | null | undefined,
    viewId: string
  ): DatabaseSettings {
    return this.merge(settings, { viewOverrides: { [viewId]: null } });
  }

  /**
   * Merges a partial set of overrides into one view's overrides.
   *
   * @param settings the current settings.
   * @param viewId the view.
   * @param overrides the overrides to change; a null value removes a key.
   * @returns the new settings.
   */
  public static mergeViewOverrides(
    settings: DatabaseSettings | null | undefined,
    viewId: string,
    overrides: NullableOverrides
  ): DatabaseSettings {
    const current: DatabaseViewOverrides = {
      ...settings?.viewOverrides?.[viewId],
    };
    for (const key of overrideKeys(overrides)) {
      const value = overrides[key];
      if (value === null || value === undefined) {
        delete current[key];
      } else {
        Object.assign(current, { [key]: value });
      }
    }
    return this.merge(settings, {
      viewOverrides: {
        [viewId]: Object.keys(current).length ? current : null,
      },
    });
  }
}

/** Overrides of a view where null removes a key. */
export type NullableOverrides = {
  [K in keyof DatabaseViewOverrides]?: DatabaseViewOverrides[K] | null;
};

function overrideKeys(
  overrides: NullableOverrides
): (keyof DatabaseViewOverrides)[] {
  const keys: (keyof DatabaseViewOverrides)[] = [
    "icon",
    "layout",
    "subGroupFieldId",
    "stackOrder",
    "hiddenStacks",
    "cardSize",
    "openPagesIn",
    "defaultTemplateId",
    "timeline",
    "subItems",
    "groupCalculation",
    "loadLimit",
  ];
  return keys.filter((key) => key in overrides);
}

function mergeEntries<T>(
  current: Record<string, T> | undefined,
  patch: Record<string, T | null>
): Record<string, T> {
  const next: Record<string, T> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

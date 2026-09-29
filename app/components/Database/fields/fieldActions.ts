import type { TFunction } from "i18next";
import { toast } from "sonner";
import type {
  DatabaseField,
  DatabaseFieldMeta,
  DatabaseFilterItem,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type Database from "~/models/Database";
import { databaseRpc } from "~/stores/DatabasesStore";
import type RootStore from "~/stores/RootStore";
import { visibilityPatch } from "../toolbar/columns";
import { insertionOrder } from "../views/TableView/layout";
import type { FieldKindId } from "./fieldTypes";
import { fieldKindSetup, uniqueFieldName } from "./fieldTypes";

/** Where a new property goes in a view. */
export interface FieldPlacement {
  view: DatabaseView;
  /** The column the new one goes next to; the end of the view without it. */
  anchorFieldId?: string;
  side?: "left" | "right";
}

/**
 * Creates a property of a kind, saves its Outline meta (status groups) and places it in a view.
 *
 * @param stores the root store.
 * @param database the database.
 * @param params the name and kind of the property.
 * @param placement the view and the column it goes next to; none adds it to the schema only.
 * @param t the translation function.
 * @returns the property, or undefined when creating failed (a toast says why).
 */
export async function createFieldOfKind(
  stores: RootStore,
  database: Database,
  params: { name: string; kind: FieldKindId },
  placement: FieldPlacement | undefined,
  t: TFunction
): Promise<DatabaseField | undefined> {
  const setup = fieldKindSetup(params.kind, t);
  return createField(
    stores,
    database,
    {
      name: uniqueFieldName(database.fields ?? [], params.name),
      type: setup.type,
      options: setup.options,
      meta: setup.meta,
    },
    placement
  );
}

/**
 * Copies a property (its type and options, not its values) next to it.
 *
 * @param stores the root store.
 * @param database the database.
 * @param field the property to copy.
 * @param view the view the copy is placed in.
 * @returns the copy, or undefined when creating failed.
 */
export async function duplicateField(
  stores: RootStore,
  database: Database,
  field: DatabaseField,
  view: DatabaseView
): Promise<DatabaseField | undefined> {
  return createField(
    stores,
    database,
    {
      name: uniqueFieldName(database.fields ?? [], field.name),
      type: field.type,
      options: field.options,
      meta: field.meta,
    },
    { view, anchorFieldId: field.id, side: "right" }
  );
}

/**
 * Converts a property to another kind, with the Outline meta that goes with it.
 *
 * @param stores the root store.
 * @param database the database.
 * @param field the property.
 * @param kind the new kind.
 * @param t the translation function.
 * @returns the converted property, or undefined when converting failed.
 */
export async function convertFieldToKind(
  stores: RootStore,
  database: Database,
  field: DatabaseField,
  kind: FieldKindId,
  t: TFunction
): Promise<DatabaseField | undefined> {
  const setup = fieldKindSetup(kind, t, field);
  try {
    const converted = await stores.databases.convertField(
      database.id,
      field.id,
      setup.type,
      setup.options
    );
    if (setup.meta || field.meta?.statusGroups) {
      await saveFieldMeta(stores, database, field.id, {
        ...field.meta,
        statusGroups: setup.meta?.statusGroups,
      });
    }
    return converted;
  } catch (err) {
    reportError(err);
    return undefined;
  }
}

/**
 * Whether any row of the database has a value in a property, whatever the views show, so that
 * converting an empty property needs no confirmation.
 *
 * @param database the database.
 * @param field the property.
 * @returns true when a row has a value, or when it could not be checked.
 */
export async function fieldHasValues(
  database: Database,
  field: DatabaseField
): Promise<boolean> {
  const viewId = database.orderedViews[0]?.id;
  if (!viewId) {
    return true;
  }
  const rule: DatabaseFilterItem =
    field.type === DatabaseFieldType.Checkbox
      ? { fieldId: field.id, operator: "is", value: true }
      : { fieldId: field.id, operator: "isNotEmpty", value: null };
  try {
    const res = await databaseRpc<DatabaseRecord[]>("/databaseRecords.list", {
      databaseId: database.id,
      viewId,
      filter: { conjunction: "and", filterSet: [rule] },
      replaceFilter: true,
      limit: 1,
    });
    return res.data.length > 0;
  } catch {
    return true;
  }
}

/**
 * Deletes a property.
 *
 * @param stores the root store.
 * @param database the database.
 * @param field the property.
 * @returns true when deleted.
 */
export async function deleteField(
  stores: RootStore,
  database: Database,
  field: DatabaseField
): Promise<boolean> {
  try {
    await stores.databases.deleteField(database.id, field.id);
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}

/**
 * Renames a property or changes its description.
 *
 * @param stores the root store.
 * @param database the database.
 * @param field the property.
 * @param patch the new name and/or description.
 * @returns true when saved.
 */
export async function updateField(
  stores: RootStore,
  database: Database,
  field: DatabaseField,
  patch: { name?: string; description?: string | null }
): Promise<boolean> {
  try {
    await stores.databases.updateField(database.id, field.id, patch);
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}

/**
 * Saves what Outline keeps next to a property (status groups, end of a date range) and reloads
 * the schema, which carries it merged into the field.
 *
 * @param stores the root store.
 * @param database the database.
 * @param fieldId the property.
 * @param meta the whole meta of the property.
 */
export async function saveFieldMeta(
  stores: RootStore,
  database: Database,
  fieldId: string,
  meta: DatabaseFieldMeta
): Promise<void> {
  await stores.databases.update(database.id, {
    settings: { fieldMeta: { [fieldId]: meta } },
  });
  await stores.databases.fetch(database.id, { force: true });
}

async function createField(
  stores: RootStore,
  database: Database,
  params: Pick<DatabaseField, "name" | "type" | "options" | "meta">,
  placement: FieldPlacement | undefined
): Promise<DatabaseField | undefined> {
  const view = placement?.view;
  const order =
    view && placement?.anchorFieldId
      ? insertionOrder(
          database.fields ?? [],
          view,
          placement.anchorFieldId,
          placement.side ?? "right"
        )
      : undefined;

  try {
    const field = await stores.databases.createField(database.id, {
      name: params.name,
      type: params.type,
      options: params.options,
      viewId: view?.id,
    });
    if (params.meta) {
      await saveFieldMeta(stores, database, field.id, params.meta);
    }
    if (view && order !== undefined) {
      await stores.databases.updateView(database.id, view.id, {
        columnMeta: {
          [field.id]: { ...visibilityPatch(view, true), order },
        },
      });
    }
    return field;
  } catch (err) {
    reportError(err);
    return undefined;
  }
}

function reportError(err: unknown) {
  toast.error(err instanceof Error ? err.message : String(err));
}

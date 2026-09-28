import type { DatabaseViewOptions } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { NotFoundError } from "@server/errors";
import { viewTypeForLayout } from "../../utils/layouts";
import type {
  DatabaseTableCreate,
  DatabaseViewCreate,
  DatabaseViewOptionsPatch,
  DatabaseViewPosition,
  DatabaseViewUpdate,
} from "../DatabaseEngine";
import { generateEngineId } from "./ids";
import { defaultColumnMeta, defaultViewOptions, uniqueName } from "./schema";
import type { EngineFieldRow, EngineViewRow } from "./types";
import type { WriteBatch } from "./WriteBatch";

/**
 * Returns a view of a table in a write.
 *
 * @param batch the write.
 * @param tableId the table.
 * @param viewId the view.
 * @returns the view.
 * @throws NotFoundError when the table has no such view.
 */
export function existingView(
  batch: WriteBatch,
  tableId: string,
  viewId: string
): EngineViewRow {
  const view = batch.views(tableId).find((item) => item.id === viewId);
  if (!view) {
    throw NotFoundError("View not found");
  }
  return view;
}

/**
 * Returns views in their order.
 *
 * @param views the views.
 * @returns a sorted copy.
 */
export function sortedViews(views: EngineViewRow[]): EngineViewRow[] {
  return [...views].sort((a, b) => a.order - b.order);
}

/**
 * Returns a new view of a table, as Teable creates one: a unique name, last
 * among the views, every field as a column, the options its type needs.
 *
 * @param batch the write.
 * @param tableId the table.
 * @param input the view to create.
 * @returns the view.
 */
export function newView(
  batch: WriteBatch,
  tableId: string,
  input: DatabaseViewCreate
): EngineViewRow {
  const views = batch.views(tableId);
  const fields = batch.fields(tableId);
  const columnMeta = defaultColumnMeta(input.type, fields);
  for (const [id, meta] of Object.entries(input.columnMeta ?? {})) {
    if (columnMeta[id]) {
      columnMeta[id] = { ...columnMeta[id], ...meta };
    }
  }
  return {
    id: generateEngineId("viw"),
    tableId,
    name: uniqueName(
      input.name?.trim() || "New view",
      views.map((item) => item.name)
    ),
    type: input.type,
    order: nextViewOrder(views),
    description: null,
    filter: null,
    sort: null,
    group: null,
    columnMeta,
    options: defaultViewOptions(input.type, fields, input.options),
    isLocked: false,
  };
}

/**
 * Returns the first view of a new table: its layout's type, the board
 * stacked by the given field, the calendar on the given date.
 *
 * @param tableId the new table.
 * @param input the table to create.
 * @param fieldIds the id of each field key of the input.
 * @param fields the fields of the new table.
 * @returns the view.
 */
export function firstView(
  tableId: string,
  input: DatabaseTableCreate,
  fieldIds: Record<string, string>,
  fields: EngineFieldRow[]
): EngineViewRow {
  const { view } = input;
  const type = viewTypeForLayout(view.layout);
  const stackFieldId = view.stackFieldKey
    ? fieldIds[view.stackFieldKey]
    : undefined;
  const dateFieldId = view.dateFieldKey
    ? fieldIds[view.dateFieldKey]
    : undefined;
  let options: DatabaseViewOptions = {};
  if (view.layout === DatabaseLayout.Board && stackFieldId) {
    options = { stackFieldId };
  } else if (view.layout === DatabaseLayout.Calendar && dateFieldId) {
    options = { startDateFieldId: dateFieldId, endDateFieldId: dateFieldId };
  }
  return {
    id: generateEngineId("viw"),
    tableId,
    name: view.name,
    type,
    order: 0,
    description: null,
    filter: null,
    sort: null,
    group: null,
    columnMeta: defaultColumnMeta(type, fields),
    options: defaultViewOptions(type, fields, options),
    isLocked: false,
  };
}

/**
 * Returns a view with the given settings changed: absent ones are kept, null
 * clears a filter, a sort, a grouping, a description or an option; column
 * settings are merged field by field.
 *
 * @param view the view.
 * @param input the settings to change.
 * @returns the updated view.
 */
export function patchedView(
  view: EngineViewRow,
  input: DatabaseViewUpdate
): EngineViewRow {
  const columnMeta = { ...view.columnMeta };
  for (const [fieldId, meta] of Object.entries(input.columnMeta ?? {})) {
    columnMeta[fieldId] = {
      ...columnMeta[fieldId],
      ...meta,
      order: meta.order ?? columnMeta[fieldId]?.order ?? 0,
    };
  }
  const options: DatabaseViewOptions = { ...view.options };
  const patch: DatabaseViewOptionsPatch = input.options ?? {};
  let key: keyof DatabaseViewOptionsPatch;
  for (key in patch) {
    const value = patch[key];
    if (value === null || value === undefined) {
      delete options[key];
    } else {
      Object.assign(options, { [key]: value });
    }
  }
  return {
    ...view,
    name: input.name?.trim() || view.name,
    description:
      input.description !== undefined ? input.description : view.description,
    filter: input.filter !== undefined ? input.filter : view.filter,
    sort: input.sort !== undefined ? input.sort : view.sort,
    group: input.group !== undefined ? input.group : view.group,
    columnMeta,
    options,
    isLocked: input.isLocked ?? view.isLocked,
  };
}

/**
 * Adds a copy of a view, last among the views, with the manual positions of
 * the records in it, which Teable would reset.
 *
 * @param batch the write.
 * @param tableId the table.
 * @param viewId the view to copy.
 * @returns the copy.
 */
export function duplicateView(
  batch: WriteBatch,
  tableId: string,
  viewId: string
): EngineViewRow {
  const source = existingView(batch, tableId, viewId);
  const views = batch.views(tableId);
  const view: EngineViewRow = {
    ...structuredClone(source),
    id: generateEngineId("viw"),
    name: uniqueName(
      source.name,
      views.map((item) => item.name)
    ),
    order: nextViewOrder(views),
  };
  batch.upsertView(view);
  for (const record of batch.snapshot(tableId).records) {
    const position = record.orders?.[source.id];
    if (position !== undefined) {
      batch.setPosition(tableId, record.id, view.id, position);
    }
  }
  return view;
}

/**
 * Moves a view before or after another one, numbering the views again.
 *
 * @param batch the write.
 * @param tableId the table.
 * @param viewId the view to move.
 * @param position the anchor view and the side.
 * @throws NotFoundError when either view does not exist.
 */
export function reorderViews(
  batch: WriteBatch,
  tableId: string,
  viewId: string,
  position: DatabaseViewPosition
) {
  const moving = existingView(batch, tableId, viewId);
  const others = sortedViews(batch.views(tableId)).filter(
    (view) => view.id !== viewId
  );
  const index = others.findIndex((view) => view.id === position.anchorId);
  if (index < 0) {
    throw NotFoundError("View not found");
  }
  const at = position.position === "before" ? index : index + 1;
  [...others.slice(0, at), moving, ...others.slice(at)].forEach(
    (view, order) => {
      if (view.order !== order) {
        batch.upsertView({ ...view, order });
      }
    }
  );
}

function nextViewOrder(views: EngineViewRow[]): number {
  return views.length ? Math.max(...views.map((view) => view.order)) + 1 : 0;
}

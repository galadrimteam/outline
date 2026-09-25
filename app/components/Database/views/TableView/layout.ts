import type {
  DatabaseField,
  DatabaseView,
  DatabaseViewOptions,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { isFieldVisible, orderedFields } from "../../toolbar/columns";

/** Width of the gutter left of the rows: drag handle and selection checkbox. */
export const GUTTER_WIDTH = 52;

/** Narrowest a column can be resized to. */
export const MIN_COLUMN_WIDTH = 64;

/** Widest a column can be resized to. */
export const MAX_COLUMN_WIDTH = 1200;

/** A column of the table as drawn. */
export interface TableColumn {
  field: DatabaseField;
  width: number;
  /** Whether the column stays in place when the table scrolls sideways. */
  frozen: boolean;
  /** Offset from the left edge of the table, for frozen columns. */
  left: number;
}

/** How tall rows are and whether their cells wrap. */
export interface RowLayout {
  /** Height in pixels (the estimate when rows fit their content). */
  height: number;
  /** Whether cells show their whole content on several lines. */
  wrap: boolean;
  /** Whether rows grow to fit their content. */
  autoFit: boolean;
}

/**
 * The width a column starts with, Notion-like: wide titles, narrow checkboxes and numbers.
 *
 * @param field the field.
 * @returns the width in pixels.
 */
export function defaultColumnWidth(field: DatabaseField): number {
  if (field.isPrimary) {
    return 280;
  }
  switch (field.type) {
    case DatabaseFieldType.Checkbox:
      return 100;
    case DatabaseFieldType.Number:
    case DatabaseFieldType.AutoNumber:
    case DatabaseFieldType.Rating:
      return 130;
    case DatabaseFieldType.LongText:
      return 260;
    default:
      return 200;
  }
}

/**
 * Keeps a resized width within bounds.
 *
 * @param width the wanted width.
 * @returns the width to use.
 */
export function clampColumnWidth(width: number): number {
  return Math.round(
    Math.min(Math.max(width, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
  );
}

/**
 * The visible columns of a table view, in the view's order, with their width and frozen state.
 * Columns up to `options.frozenFieldId` are frozen; without it, the first column is.
 *
 * @param fields the database fields.
 * @param view the view.
 * @param widths widths being resized, by field id, that win over the saved ones.
 * @returns the columns.
 */
export function tableColumns(
  fields: DatabaseField[],
  view: DatabaseView,
  widths: Record<string, number> = {}
): TableColumn[] {
  const visible = orderedFields(fields, view).filter((field) =>
    isFieldVisible(view, field)
  );
  const frozenIndex = Math.max(
    visible.findIndex((field) => field.id === view.options.frozenFieldId),
    0
  );

  let left = GUTTER_WIDTH;
  return visible.map((field, index) => {
    const width =
      widths[field.id] ??
      view.columnMeta[field.id]?.width ??
      defaultColumnWidth(field);
    const frozen = index <= frozenIndex;
    const column = { field, width, frozen, left };
    left += width;
    return column;
  });
}

/**
 * Row height and wrapping for a view's `rowHeight` option. Notion's "Wrap all columns" is
 * `autoFit`; taller presets wrap within their height.
 *
 * @param rowHeight the view option.
 * @returns the row layout.
 */
export function rowLayout(
  rowHeight: DatabaseViewOptions["rowHeight"]
): RowLayout {
  switch (rowHeight) {
    case "medium":
      return { height: 56, wrap: true, autoFit: false };
    case "tall":
      return { height: 84, wrap: true, autoFit: false };
    case "extraTall":
      return { height: 108, wrap: true, autoFit: false };
    case "autoFit":
      return { height: 36, wrap: true, autoFit: true };
    default:
      return { height: 36, wrap: false, autoFit: false };
  }
}

/**
 * Moves an id to the place of another one, like dropping a dragged column on another.
 *
 * @param ids the ids in order.
 * @param activeId the id moved.
 * @param overId the id whose place it takes.
 * @returns the new order, the same array when nothing moves.
 */
export function moveId(
  ids: string[],
  activeId: string,
  overId: string
): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) {
    return ids;
  }
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}

/**
 * Where a new column goes next to another one, as an order between its neighbours in the view.
 *
 * @param fields the database fields.
 * @param view the view.
 * @param fieldId the column next to which the new one goes.
 * @param side which side of it.
 * @returns the `columnMeta.order` of the new column.
 */
export function insertionOrder(
  fields: DatabaseField[],
  view: DatabaseView,
  fieldId: string,
  side: "left" | "right"
): number {
  const ordered = orderedFields(fields, view);
  const orderOf = (index: number) =>
    view.columnMeta[ordered[index]?.id]?.order ?? index;
  const index = ordered.findIndex((field) => field.id === fieldId);
  if (index === -1) {
    return ordered.length;
  }
  const neighbour = side === "left" ? index - 1 : index + 1;
  if (neighbour < 0) {
    return orderOf(index) - 1;
  }
  if (neighbour >= ordered.length) {
    return orderOf(index) + 1;
  }
  return (orderOf(index) + orderOf(neighbour)) / 2;
}

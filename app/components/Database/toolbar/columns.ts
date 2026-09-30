import type {
  DatabaseColumnMeta,
  DatabaseField,
  DatabaseView,
} from "@shared/databases/types";

/**
 * Whether the view hides fields with `columnMeta.hidden` (the engine's grid,
 * drawn as table, list or timeline) rather than showing them with `visible`
 * (board, gallery, calendar, form).
 *
 * @param view the view.
 * @returns true for grid-based views.
 */
export function hidesWithFlag(view: Pick<DatabaseView, "type">): boolean {
  return view.type === "grid";
}

/**
 * Whether a field is shown by a view. The primary field is always shown: it
 * is the title of cards and a column of every table.
 *
 * @param view the view.
 * @param field the field.
 * @returns true when shown.
 */
export function isFieldVisible(
  view: Pick<DatabaseView, "type" | "columnMeta">,
  field: Pick<DatabaseField, "id" | "isPrimary">
): boolean {
  if (field.isPrimary) {
    return true;
  }
  const meta = view.columnMeta[field.id];
  return hidesWithFlag(view) ? !meta?.hidden : !!meta?.visible;
}

/**
 * Returns the fields in the view's order (`columnMeta.order`), like Notion
 * where the title column can sit anywhere; the primary field goes first only
 * when the view gives it no place, and other fields without an order go last
 * in their schema order.
 *
 * @param fields the database fields.
 * @param view the view.
 * @returns the ordered fields.
 */
export function orderedFields<
  T extends Pick<DatabaseField, "id" | "isPrimary">,
>(fields: T[], view: Pick<DatabaseView, "columnMeta">): T[] {
  const rank = (field: T, index: number): [number, number] => [
    view.columnMeta[field.id]?.order ??
      (field.isPrimary ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY),
    index,
  ];
  return fields
    .map((field, index) => ({ field, key: rank(field, index) }))
    .sort((a, b) => compareRanks(a.key[0], b.key[0]) || a.key[1] - b.key[1])
    .map(({ field }) => field);
}

function compareRanks(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Returns the properties a card shows under its title: the visible fields
 * other than the primary one, in the view's order.
 *
 * @param fields the database fields.
 * @param view the view.
 * @returns the fields to show on cards and list rows.
 */
export function cardFields<T extends Pick<DatabaseField, "id" | "isPrimary">>(
  fields: T[],
  view: Pick<DatabaseView, "type" | "columnMeta">
): T[] {
  return orderedFields(fields, view).filter(
    (field) => !field.isPrimary && isFieldVisible(view, field)
  );
}

/**
 * Returns the column meta change that shows or hides a field in a view.
 *
 * @param view the view.
 * @param visible whether the field should be shown.
 * @returns the partial column meta to save.
 */
export function visibilityPatch(
  view: Pick<DatabaseView, "type">,
  visible: boolean
): Partial<DatabaseColumnMeta> {
  return hidesWithFlag(view) ? { hidden: !visible } : { visible };
}

/**
 * Returns the column meta changes that give fields the order of `ids`, only
 * for the fields whose order changes.
 *
 * @param view the view.
 * @param ids every field id, in the wanted order.
 * @returns the column meta changes, by field id.
 */
export function orderPatch(
  view: Pick<DatabaseView, "columnMeta">,
  ids: string[]
): Record<string, Partial<DatabaseColumnMeta>> {
  const patch: Record<string, Partial<DatabaseColumnMeta>> = {};
  ids.forEach((id, order) => {
    if (view.columnMeta[id]?.order !== order) {
      patch[id] = { order };
    }
  });
  return patch;
}

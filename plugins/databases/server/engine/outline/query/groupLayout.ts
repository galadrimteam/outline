import type {
  DatabaseCellValue,
  DatabaseGroup,
  DatabaseGroupLayout,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { cellItems, isObjectItem, itemId, itemTitle } from "./cellValues";
import type { ComputedRecord } from "./contract";
import type { QueryField } from "./fields";
import { isUserOrLinkType } from "./fields";
import type { SortLevel } from "./sort";
import { sortLevels } from "./sort";

/**
 * The levels of a view's grouping, the first one in the order the view gives
 * its groups.
 *
 * @param group the grouping levels.
 * @param fields the table's fields by id.
 * @param layout the order of the view's groups.
 * @returns the levels.
 */
export function groupLevels(
  group: DatabaseGroup | null | undefined,
  fields: Map<string, QueryField>,
  layout: DatabaseGroupLayout | undefined
): SortLevel[] {
  const [first, ...rest] = sortLevels(group, fields);
  if (!first) {
    return [];
  }
  return [{ ...first, rank: groupRank(first.field, layout) }, ...rest];
}

/**
 * The key of the group a cell falls in, as the app and the Notion migration
 * name groups: the choice name, "true" or "false" for a checkbox, the id of a
 * person or a linked row, "" for the rows without a value. A list is keyed by
 * its first element.
 *
 * @param field the grouping field.
 * @param cell the cell value.
 * @returns the key.
 */
export function groupKey(
  field: QueryField,
  cell: DatabaseCellValue | undefined
): string {
  const items = cellItems(cell);
  if (field.type === DatabaseFieldType.Checkbox) {
    return items.some((item) => item === true || item === "true")
      ? "true"
      : "false";
  }
  const [first] = items;
  if (first === undefined) {
    return "";
  }
  if (isUserOrLinkType(field.type) && isObjectItem(first)) {
    return itemId(first) ?? "";
  }
  return itemTitle(first);
}

/**
 * Leaves out the records of the groups a view folds away.
 *
 * @param records the records.
 * @param field the field of the first level of grouping.
 * @param layout the order and the hidden groups of the view.
 * @returns the records of the groups shown.
 */
export function withoutHiddenGroups(
  records: ComputedRecord[],
  field: QueryField,
  layout: DatabaseGroupLayout | undefined
): ComputedRecord[] {
  const hidden = new Set(layout?.hidden ?? []);
  if (!hidden.size) {
    return records;
  }
  return records.filter(
    (record) => !hidden.has(groupKey(field, record.cells[field.id]))
  );
}

/**
 * The place of a cell's group in the order a view gives its groups; the
 * groups it does not list come after, in their own order.
 *
 * @param field the field of the first level of grouping.
 * @param layout the order and the hidden groups of the view.
 * @returns the rank of a cell, undefined without an order.
 */
export function groupRank(
  field: QueryField,
  layout: DatabaseGroupLayout | undefined
): ((cell: DatabaseCellValue | undefined) => number) | undefined {
  if (!layout?.order?.length) {
    return undefined;
  }
  const ranks = new Map(layout.order.map((key, index) => [key, index]));
  return (cell) => ranks.get(groupKey(field, cell)) ?? Number.POSITIVE_INFINITY;
}

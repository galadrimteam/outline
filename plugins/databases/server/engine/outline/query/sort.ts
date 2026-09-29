import type {
  DatabaseCellValue,
  DatabaseSortItem,
  DatabaseSortOrder,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { CellItem } from "./cellValues";
import { cellItems, isObjectItem, itemId, itemTitle } from "./cellValues";
import type { ComputedRecord } from "./contract";
import type { QueryField } from "./fields";
import { fieldTimeZone, showsTime } from "./fields";
import { looseNumber } from "./formula/values";
import { startOf } from "./time/calendar";

/** One level of an ordering: a field and a direction. */
export interface SortLevel {
  field: QueryField;
  order: DatabaseSortOrder;
  /** Empty cells after the others whatever the order, as Notion sorts; else first when ascending, as Teable. */
  emptiesLast?: boolean;
}

/** What a record is ordered by on one level; null for an empty cell. */
export type SortValue = number | string | null | SortValue[];

const collator = new Intl.Collator("fr", {
  sensitivity: "base",
  numeric: true,
});

/**
 * Turns sort items into levels, leaving out unknown fields.
 *
 * @param items the sort items.
 * @param fields the table's fields by id.
 * @returns the levels.
 */
export function sortLevels(
  items: DatabaseSortItem[] | null | undefined,
  fields: Map<string, QueryField>,
  options: { emptiesLast?: boolean } = {}
): SortLevel[] {
  return (items ?? []).flatMap((item) => {
    const field = fields.get(item.fieldId);
    return field
      ? [{ field, order: item.order, emptiesLast: options.emptiesLast }]
      : [];
  });
}

/**
 * Returns what a cell is ordered by, as Teable orders: numbers numerically,
 * dates by day (by instant when the field shows a time), selects by the
 * order of their choices, people and links by title, text in French
 * alphabetical order (case, accents and numbers read naturally), lists by
 * their first element then the rest. Days are those of the field's zone
 * (UTC when it names none, as for grouping).
 *
 * @param field the field.
 * @param cell the cell value.
 * @returns the value to compare.
 */
export function sortValue(
  field: QueryField,
  cell: DatabaseCellValue | undefined
): SortValue {
  const items = cellItems(cell);
  if (!items.length) {
    return null;
  }
  const choices = field.isLookup ? undefined : field.options.choices;
  if (choices?.length && field.type === DatabaseFieldType.MultipleSelect) {
    const texts = items.map(itemTitle);
    return [choiceIndex(choices, texts[0]), texts.join(", ")];
  }
  const key = elementKey(field);
  return field.isMultipleCellValue ? items.map(key) : key(items[0]);
}

/**
 * Compares two sort values: empty first in ascending order, last in
 * descending order.
 *
 * @param a a value.
 * @param b another value.
 * @param order the direction.
 * @returns a negative number when a comes first, positive when b does, 0 for a tie.
 */
export function compareSortValues(
  a: SortValue,
  b: SortValue,
  order: DatabaseSortOrder,
  emptiesLast = false
): number {
  const aEmpty = isEmptyKey(a);
  const bEmpty = isEmptyKey(b);
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) {
      return 0;
    }
    const emptyFirst = aEmpty ? -1 : 1;
    return order === "asc" && !emptiesLast ? emptyFirst : -emptyFirst;
  }
  const result = compareRaw(a, b);
  return order === "asc" ? result : -result;
}

/**
 * Orders records by levels, then by their manual position in a view, then
 * by creation.
 *
 * @param records the records.
 * @param levels the levels, the first one deciding first.
 * @param viewId the view whose manual order breaks ties.
 * @returns the records in order (a new array).
 */
export function sortRecords(
  records: ComputedRecord[],
  levels: SortLevel[],
  viewId?: string
): ComputedRecord[] {
  const keyed = records.map((record) => ({
    record,
    keys: levels.map((level) =>
      sortValue(level.field, record.cells[level.field.id])
    ),
    manual: viewId
      ? (record.row.orders?.[viewId] ?? record.row.autoNumber)
      : record.row.autoNumber,
  }));
  keyed.sort((a, b) => {
    for (let index = 0; index < levels.length; index++) {
      const result = compareSortValues(
        a.keys[index],
        b.keys[index],
        levels[index].order,
        levels[index].emptiesLast
      );
      if (result) {
        return result;
      }
    }
    return (
      a.manual - b.manual || a.record.row.autoNumber - b.record.row.autoNumber
    );
  });
  return keyed.map((item) => item.record);
}

function elementKey(field: QueryField): (item: CellItem) => SortValue {
  switch (field.cellValueType) {
    case "number":
      return (item) =>
        typeof item === "number" ? item : looseNumber(itemTitle(item));
    case "boolean":
      return (item) => (item === true || item === "true" ? 1 : 0);
    case "dateTime": {
      const byInstant = showsTime(field);
      const timeZone = fieldTimeZone(field);
      return (item) => {
        const ms = typeof item === "string" ? Date.parse(item) : NaN;
        if (Number.isNaN(ms)) {
          return null;
        }
        return byInstant ? ms : startOf(ms, "day", timeZone);
      };
    }
    default: {
      const choices = field.isLookup ? undefined : field.options.choices;
      if (choices?.length && field.type === DatabaseFieldType.SingleSelect) {
        return (item) => [
          choiceIndex(choices, itemTitle(item)),
          itemTitle(item),
        ];
      }
      return (item) =>
        isObjectItem(item)
          ? [itemTitle(item), itemId(item) ?? ""]
          : itemTitle(item);
    }
  }
}

function choiceIndex(choices: { name: string }[], name: string): number {
  return choices.findIndex((choice) => choice.name === name);
}

function isEmptyKey(value: SortValue): boolean {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function compareRaw(a: SortValue, b: SortValue): number {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? -1 : 1;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : [a];
    const right = Array.isArray(b) ? b : [b];
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const result = compareRaw(left[index], right[index]);
      if (result) {
        return result;
      }
    }
    return left.length - right.length;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (typeof a === "string" && typeof b === "string") {
    // Texts the collation finds equal ("a", "A", "à") still need a fixed order, or equal groups would split.
    return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  }
  return typeof a === "number" ? -1 : 1;
}

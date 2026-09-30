import type {
  DatabaseCellValue,
  DatabaseGroup,
  DatabaseGroupPoint,
} from "@shared/databases/types";
import type { TableSnapshot } from "../types";
import type { CellItem } from "./cellValues";
import {
  cellFromItems,
  cellItems,
  isAttachmentItem,
  isObjectItem,
  itemId,
  itemTitle,
} from "./cellValues";
import type { ComputedRecord } from "./contract";
import type { QueryField } from "./fields";
import {
  fieldTimeZone,
  fieldsById,
  formattingOf,
  isUserOrLinkType,
} from "./fields";
import { roundNumber } from "./formula/functions/numeric";
import type { SortLevel } from "./sort";
import { compareSortValues, sortLevels, sortValue } from "./sort";
import type { TimeUnit } from "./time/calendar";
import { startOf } from "./time/calendar";

/**
 * Returns the group headers and row counts of records, as Teable answers
 * them: records are ordered by the grouping fields (a stable order: the
 * records' own order is kept inside a group), then each change of value on
 * a level opens a header of that level and of the levels under it, and each
 * group of the last level is followed by the count of its rows. Values are
 * grouped as shown: numbers at the field's precision, dates by day (by
 * minute when a time is shown, by month or year for such formats), lists as
 * a whole. Header ids are stable hashes of the values of the path.
 *
 * @param table the table.
 * @param records the selected records.
 * @param group the grouping levels.
 * @returns the group points.
 */
export function groupPoints(
  table: TableSnapshot,
  records: ComputedRecord[],
  group: DatabaseGroup
): DatabaseGroupPoint[] {
  const levels = sortLevels(group, fieldsById(table.fields));
  if (!levels.length || !records.length) {
    return [];
  }
  const rows = orderByGroups(records, levels).map((record) =>
    levels.map((level) => groupValue(level.field, record.cells[level.field.id]))
  );

  const points: DatabaseGroupPoint[] = [];
  let previous: string[] | null = null;
  let count = 0;
  for (const values of rows) {
    const keys = values.map((value) => JSON.stringify(value));
    const changedAt = previous
      ? keys.findIndex((key, depth) => key !== previous?.[depth])
      : 0;
    if (changedAt >= 0) {
      if (count) {
        points.push({ type: "row", count });
      }
      count = 0;
      for (let depth = changedAt; depth < levels.length; depth++) {
        points.push({
          type: "header",
          id: groupId(levels[depth].field.id, keys.slice(0, depth + 1)),
          depth,
          value: values[depth],
          isCollapsed: false,
        });
      }
      previous = keys;
    }
    count++;
  }
  points.push({ type: "row", count });
  return points;
}

/**
 * Returns the records of each group, at every level, keyed by the header ids
 * `groupPoints` gives the same records.
 *
 * @param table the table.
 * @param records the selected records.
 * @param group the grouping levels.
 * @returns the records of each group, in their order.
 */
export function groupMembers(
  table: TableSnapshot,
  records: ComputedRecord[],
  group: DatabaseGroup
): Map<string, ComputedRecord[]> {
  const levels = sortLevels(group, fieldsById(table.fields));
  const members = new Map<string, ComputedRecord[]>();
  if (!levels.length) {
    return members;
  }
  for (const record of orderByGroups(records, levels)) {
    const keys = levels.map((level) =>
      JSON.stringify(groupValue(level.field, record.cells[level.field.id]))
    );
    levels.forEach((level, depth) => {
      const id = groupId(level.field.id, keys.slice(0, depth + 1));
      const list = members.get(id);
      if (list) {
        list.push(record);
      } else {
        members.set(id, [record]);
      }
    });
  }
  return members;
}

/**
 * Returns the value a cell is grouped under.
 *
 * @param field the grouping field.
 * @param cell the cell value.
 * @returns the header value, null for the group of empty cells.
 */
export function groupValue(
  field: QueryField,
  cell: DatabaseCellValue | undefined
): DatabaseCellValue {
  const items = cellItems(cell);
  if (!items.length) {
    return null;
  }
  const normalize = normalizer(field);
  const normalized = items.map(normalize);
  if (field.isMultipleCellValue) {
    return cellFromItems(normalized);
  }
  const [first] = normalized;
  return isAttachmentItem(first) ? [first] : first;
}

function normalizer(field: QueryField): (item: CellItem) => CellItem {
  switch (field.cellValueType) {
    case "number": {
      const precision = formattingOf(field).precision ?? 0;
      return (item) =>
        typeof item === "number" ? roundNumber(item, precision, "half") : item;
    }
    case "dateTime": {
      const unit = dateUnit(field);
      const timeZone = fieldTimeZone(field);
      return (item) => {
        const ms = typeof item === "string" ? Date.parse(item) : NaN;
        return Number.isNaN(ms)
          ? item
          : new Date(startOf(ms, unit, timeZone)).toISOString();
      };
    }
    default:
      if (isUserOrLinkType(field.type)) {
        return (item) =>
          isObjectItem(item)
            ? { id: itemId(item) ?? "", title: itemTitle(item) }
            : item;
      }
      return (item) => item;
  }
}

function dateUnit(field: QueryField): TimeUnit {
  const { date, time } = formattingOf(field);
  switch (date) {
    case "YYYY":
      return "year";
    case "YYYY-MM":
    case "MM":
      return "month";
    default:
      return time && time !== "None" ? "minute" : "day";
  }
}

function orderByGroups(
  records: ComputedRecord[],
  levels: SortLevel[]
): ComputedRecord[] {
  const keyed = records.map((record, position) => ({
    record,
    position,
    keys: levels.map((level) =>
      sortValue(level.field, record.cells[level.field.id])
    ),
  }));
  keyed.sort((a, b) => {
    for (let index = 0; index < levels.length; index++) {
      const result = compareSortValues(
        a.keys[index],
        b.keys[index],
        levels[index].order
      );
      if (result) {
        return result;
      }
    }
    return a.position - b.position;
  });
  return keyed.map((item) => item.record);
}

// djb2 (Bernstein): stable ids for the same path of values.
function groupId(fieldId: string, path: string[]): string {
  const text = `${fieldId}_${path.join("_")}`;
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = (Math.imul(hash, 33) + text.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

import type {
  DatabaseCellValue,
  DatabaseStatisticFunc,
} from "@shared/databases/types";
import type { TableSnapshot } from "../types";
import type { CellItem } from "./cellValues";
import {
  cellItems,
  isAttachmentItem,
  isEmptyCell,
  isObjectItem,
  itemId,
} from "./cellValues";
import type { ComputedRecord } from "./contract";
import type { QueryField } from "./fields";
import { fieldTimeZone, fieldsById, isUserType } from "./fields";
import { looseNumber } from "./formula/values";
import { DAY, diffUnits } from "./time/calendar";

/** The result of one statistic. */
export interface StatisticValue {
  value: number | string | null;
}

/**
 * Computes one statistic per field over records, as Teable's footers do:
 * counts are whole numbers, percentages go from 0 to 100 unrounded, sums,
 * averages and extremes are left to the reader to format, dates come back
 * as ISO 8601, date ranges as whole days or months. A list cell counts its
 * elements for unique values and numbers, and once for emptiness.
 *
 * @param table the table.
 * @param records the selected records.
 * @param fieldStats the statistic of each field.
 * @returns the value of each statistic by field id; an unknown field gives null.
 */
export function aggregate(
  table: TableSnapshot,
  records: ComputedRecord[],
  fieldStats: Record<string, DatabaseStatisticFunc>
): Record<string, StatisticValue> {
  const fields = fieldsById(table.fields);
  const result: Record<string, StatisticValue> = {};
  for (const [fieldId, func] of Object.entries(fieldStats)) {
    const field = fields.get(fieldId);
    result[fieldId] = {
      value: field
        ? statistic(
            func,
            field,
            records.map((record) => record.cells[fieldId])
          )
        : null,
    };
  }
  return result;
}

function statistic(
  func: DatabaseStatisticFunc,
  field: QueryField,
  cells: (DatabaseCellValue | undefined)[]
): number | string | null {
  const total = cells.length;
  const percent = (count: number) => (count / Math.max(total, 1)) * 100;
  const filled = () => cells.filter((cell) => !isEmptyCell(cell)).length;
  const checked = () =>
    cells.filter((cell) =>
      cellItems(cell).some((item) => item === true || item === "true")
    ).length;
  const unique = () =>
    new Set(cells.flatMap((cell) => cellItems(cell).map(uniqueKey(field))))
      .size;

  switch (func) {
    case "count":
      return total;
    case "empty":
      return total - filled();
    case "filled":
      return filled();
    case "unique":
      return unique();
    case "percentEmpty":
      return percent(total - filled());
    case "percentFilled":
      return percent(filled());
    case "percentUnique":
      return percent(unique());
    case "checked":
      return checked();
    case "unChecked":
      return total - checked();
    case "percentChecked":
      return percent(checked());
    case "percentUnChecked":
      return percent(total - checked());
    case "sum": {
      const values = numbers(cells);
      return values.length
        ? values.reduce((sum, value) => sum + value, 0)
        : null;
    }
    case "average": {
      const values = numbers(cells);
      return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    }
    case "max":
    case "min":
    case "earliestDate":
    case "latestDate": {
      const highest = func === "max" || func === "latestDate";
      if (field.cellValueType === "dateTime") {
        const [first, last] = instantRange(cells);
        const ms = highest ? last : first;
        return ms === null ? null : new Date(ms).toISOString();
      }
      const values = numbers(cells);
      if (!values.length) {
        return null;
      }
      return values.reduce((best, value) =>
        highest ? Math.max(best, value) : Math.min(best, value)
      );
    }
    case "dateRangeOfDays": {
      const [first, last] = instantRange(cells);
      return first === null || last === null
        ? null
        : Math.floor((last - first) / DAY);
    }
    case "dateRangeOfMonths": {
      const [first, last] = instantRange(cells);
      return first === null || last === null
        ? 0
        : Math.trunc(diffUnits(last, first, "month", fieldTimeZone(field)));
    }
    case "totalAttachmentSize":
      return cells
        .flatMap(cellItems)
        .filter(isAttachmentItem)
        .reduce((sum, item) => sum + (item.size || 0), 0);
    default:
      return null;
  }
}

function numbers(cells: (DatabaseCellValue | undefined)[]): number[] {
  return cells
    .flatMap(cellItems)
    .map((item) =>
      typeof item === "number"
        ? item
        : typeof item === "string"
          ? looseNumber(item)
          : null
    )
    .filter((item): item is number => item !== null && Number.isFinite(item));
}

function instantRange(
  cells: (DatabaseCellValue | undefined)[]
): [number | null, number | null] {
  let first: number | null = null;
  let last: number | null = null;
  for (const item of cells.flatMap(cellItems)) {
    const ms = typeof item === "string" ? Date.parse(item) : NaN;
    if (Number.isNaN(ms)) {
      continue;
    }
    first = first === null ? ms : Math.min(first, ms);
    last = last === null ? ms : Math.max(last, ms);
  }
  return [first, last];
}

function uniqueKey(field: QueryField): (item: CellItem) => string {
  return (item) => {
    if (isObjectItem(item)) {
      return isUserType(field.type) || itemId(item)
        ? `id:${itemId(item) ?? ""}`
        : JSON.stringify(item);
    }
    return `${typeof item}:${String(item)}`;
  };
}

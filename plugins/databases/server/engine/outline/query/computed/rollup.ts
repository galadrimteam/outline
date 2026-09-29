import type { DatabaseCellValue } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { CellItem } from "../cellValues";
import {
  cellFromItems,
  cellItems,
  isEmptyCell,
  itemId,
  itemTitle,
} from "../cellValues";
import type { QueryField } from "../fields";
import type { ValueType } from "../formula/values";
import { BOOLEAN, DATE, NUMBER, TEXT, looseNumber } from "../formula/values";
import { cellItemText } from "../text";

/** The aggregations a rollup can apply to the values of its linked records. */
export type RollupFunction =
  | "countall"
  | "counta"
  | "count"
  | "sum"
  | "average"
  | "max"
  | "min"
  | "and"
  | "or"
  | "xor"
  | "array_join"
  | "array_unique"
  | "array_compact"
  | "concatenate";

const FUNCTIONS: RollupFunction[] = [
  "countall",
  "counta",
  "count",
  "sum",
  "average",
  "max",
  "min",
  "and",
  "or",
  "xor",
  "array_join",
  "array_unique",
  "array_compact",
  "concatenate",
];

/**
 * Reads a rollup expression such as `sum({values})`.
 *
 * @param expression the expression of the rollup.
 * @returns the aggregation, or null for an expression rollups do not have.
 */
export function parseRollup(
  expression: string | undefined
): RollupFunction | null {
  const match = /^\s*([a-z_]+)\s*\(\s*\{\s*values\s*\}\s*\)\s*$/i.exec(
    expression ?? ""
  );
  const name = match?.[1].toLowerCase();
  return FUNCTIONS.find((fn) => fn === name) ?? null;
}

/**
 * The type a rollup gives: counts and sums are numbers, the extremes of
 * dates are dates, logical ones booleans, joins text, unique and compact a
 * list of the looked-up values.
 *
 * @param fn the aggregation.
 * @param target the type of the looked-up field.
 * @returns the type.
 */
export function rollupType(fn: RollupFunction, target: ValueType): ValueType {
  switch (fn) {
    case "max":
    case "min":
      return target.type === "dateTime" ? DATE : NUMBER;
    case "and":
    case "or":
    case "xor":
      return BOOLEAN;
    case "array_join":
    case "concatenate":
      return TEXT;
    case "array_unique":
    case "array_compact":
      return { type: target.type, isMultiple: true };
    default:
      return NUMBER;
  }
}

/**
 * Aggregates the values of the linked records the way Teable's rollups do:
 * sums and averages are 0 without values, counts count the linked records
 * (all of them for countall, those with a value otherwise), extremes and
 * logical ones ignore blanks and give nothing without values, joins write
 * each value as its field shows it.
 *
 * @param fn the aggregation.
 * @param cells the looked-up cell of each linked record, in link order.
 * @param target the looked-up field.
 * @returns the rollup's cell.
 */
export function rollupCell(
  fn: RollupFunction,
  cells: (DatabaseCellValue | undefined)[],
  target: Pick<QueryField, "type" | "options" | "cellValueType">
): DatabaseCellValue {
  const items = cells.flatMap(cellItems).filter((item) => item !== "");
  switch (fn) {
    case "countall":
      return target.type === DatabaseFieldType.MultipleSelect
        ? items.length
        : cells.length;
    case "counta":
    case "count":
      return cells.filter((cell) => !isEmptyCell(cell)).length;
    case "sum":
      return numbers(items).reduce((sum, value) => sum + value, 0);
    case "average": {
      const values = numbers(items);
      return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
    }
    case "max":
    case "min":
      return extreme(items, fn, target.cellValueType === "dateTime");
    case "and": {
      const truths = items.map(isTrue);
      return truths.length ? truths.every(Boolean) : null;
    }
    case "or": {
      const truths = items.map(isTrue);
      return truths.length ? truths.some(Boolean) : null;
    }
    case "xor":
      return items.filter(isTrue).length % 2 === 1;
    case "array_join":
    case "concatenate": {
      const texts = items
        .map((item) => cellItemText(item, target))
        .filter(Boolean);
      return texts.length ? texts.join(", ") : null;
    }
    case "array_unique":
      return cellFromItems(unique(items));
    case "array_compact":
      return cellFromItems(items);
  }
}

function numbers(items: CellItem[]): number[] {
  return items
    .map((item) =>
      typeof item === "number"
        ? item
        : typeof item === "string"
          ? looseNumber(item)
          : null
    )
    .filter((item): item is number => item !== null && Number.isFinite(item));
}

function extreme(
  items: CellItem[],
  fn: "max" | "min",
  isDate: boolean
): DatabaseCellValue {
  const values = isDate
    ? items
        .map((item) => (typeof item === "string" ? Date.parse(item) : NaN))
        .filter((item) => !Number.isNaN(item))
    : numbers(items);
  if (!values.length) {
    return null;
  }
  const best = values.reduce((current, value) =>
    fn === "max" ? Math.max(current, value) : Math.min(current, value)
  );
  return isDate ? new Date(best).toISOString() : best;
}

function isTrue(item: CellItem): boolean {
  if (typeof item === "boolean") {
    return item;
  }
  if (typeof item === "number") {
    return item !== 0;
  }
  if (typeof item === "string") {
    return item !== "" && item !== "false";
  }
  return true;
}

function unique(items: CellItem[]): CellItem[] {
  const seen = new Set<string | number | boolean>();
  return items.filter((item) => {
    const key =
      itemId(item) ?? (typeof item === "object" ? itemTitle(item) : item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

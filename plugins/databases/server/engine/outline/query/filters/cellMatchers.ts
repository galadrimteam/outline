import type {
  DatabaseCellValue,
  DatabaseFilterOperator,
  DatabaseFilterValue,
} from "@shared/databases/types";
import { isDateFilterValue } from "@shared/databases/filters";
import { cellIds, cellItems, isEmptyCell, itemTitle } from "../cellValues";
import type { QueryField } from "../fields";
import { isUserOrLinkType } from "../fields";
import { looseNumber } from "../formula/values";
import { dateFilterRange } from "./dateRange";

/** Tells whether a cell passes one rule of a filter. */
export type CellMatcher = (cell: DatabaseCellValue | undefined) => boolean;

/** What a rule needs besides its field, operator and value. */
export interface MatcherContext {
  now: number;
  timeZone: string;
}

/**
 * Builds the test of one filter rule, with Teable's meaning for the field's
 * kind: checkboxes, numbers, dates, people and links (by id), lists (any,
 * all, exactly…; text compared without case) and single text (`is` exact,
 * `contains` without case). Negative rules accept empty cells.
 *
 * @param field the filtered field.
 * @param operator the operator.
 * @param value the rule's value.
 * @param context the current instant and default zone.
 * @returns the test, or null when the rule cannot apply to this field.
 */
export function cellMatcher(
  field: QueryField,
  operator: DatabaseFilterOperator,
  value: DatabaseFilterValue,
  context: MatcherContext
): CellMatcher | null {
  if (operator === "isEmpty") {
    return isEmptyCell;
  }
  if (operator === "isNotEmpty") {
    return (cell) => !isEmptyCell(cell);
  }
  switch (field.cellValueType) {
    case "boolean":
      return booleanMatcher(operator, value);
    case "number":
      return numberMatcher(field, operator, value);
    case "dateTime":
      return dateMatcher(field, operator, value, context);
    default:
      if (isUserOrLinkType(field.type)) {
        return idMatcher(field, operator, value);
      }
      return field.isMultipleCellValue
        ? listMatcher(operator, value)
        : textMatcher(operator, value);
  }
}

function booleanMatcher(
  operator: DatabaseFilterOperator,
  value: DatabaseFilterValue
): CellMatcher | null {
  if (operator !== "is") {
    return null;
  }
  const wanted = value === true || value === "true";
  return (cell) => {
    const checked = cellItems(cell).some(
      (item) => item === true || item === "true"
    );
    return wanted ? checked : !checked;
  };
}

function numberMatcher(
  field: QueryField,
  operator: DatabaseFilterOperator,
  value: DatabaseFilterValue
): CellMatcher | null {
  const wanted =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? looseNumber(value)
        : null;
  if (wanted === null) {
    return null;
  }
  const test = numberTest(operator, wanted);
  if (!test) {
    return null;
  }
  const numbers = (cell: DatabaseCellValue | undefined) =>
    cellItems(cell).filter((item): item is number => typeof item === "number");
  if (operator === "isNot") {
    return (cell) => !numbers(cell).some((number) => number === wanted);
  }
  return field.isMultipleCellValue
    ? (cell) => numbers(cell).some(test)
    : (cell) => {
        const [number] = numbers(cell);
        return number !== undefined && test(number);
      };
}

function numberTest(
  operator: DatabaseFilterOperator,
  wanted: number
): ((number: number) => boolean) | null {
  switch (operator) {
    case "is":
    case "isNot":
      return (number) => number === wanted;
    case "isGreater":
      return (number) => number > wanted;
    case "isGreaterEqual":
      return (number) => number >= wanted;
    case "isLess":
      return (number) => number < wanted;
    case "isLessEqual":
      return (number) => number <= wanted;
    default:
      return null;
  }
}

function dateMatcher(
  field: QueryField,
  operator: DatabaseFilterOperator,
  value: DatabaseFilterValue,
  context: MatcherContext
): CellMatcher | null {
  if (!isDateFilterValue(value)) {
    return null;
  }
  const range = dateFilterRange(value, field, context.now, context.timeZone);
  if (!range) {
    return null;
  }
  const [start, end] = range;
  const instants = (cell: DatabaseCellValue | undefined) =>
    cellItems(cell)
      .map((item) => (typeof item === "string" ? Date.parse(item) : NaN))
      .filter((item) => !Number.isNaN(item));
  const within = (ms: number) => ms >= start && ms <= end;

  if (operator === "isNot") {
    return (cell) => !instants(cell).some(within);
  }
  const test = instantTest(operator, start, end);
  return test ? (cell) => instants(cell).some(test) : null;
}

function instantTest(
  operator: DatabaseFilterOperator,
  start: number,
  end: number
): ((ms: number) => boolean) | null {
  switch (operator) {
    case "is":
    case "isWithIn":
      return (ms) => ms >= start && ms <= end;
    case "isAfter":
    case "isGreater":
      return (ms) => ms > end;
    case "isOnOrAfter":
    case "isGreaterEqual":
      return (ms) => ms >= start;
    case "isBefore":
    case "isLess":
      return (ms) => ms < start;
    case "isOnOrBefore":
    case "isLessEqual":
      return (ms) => ms <= end;
    default:
      return null;
  }
}

function idMatcher(
  field: QueryField,
  operator: DatabaseFilterOperator,
  value: DatabaseFilterValue
): CellMatcher | null {
  const wanted = valueList(value);
  const any = (cell: DatabaseCellValue | undefined) =>
    cellIds(cell).some((id) => wanted.includes(id));
  switch (operator) {
    case "is":
      return field.isMultipleCellValue
        ? any
        : (cell) => cellIds(cell)[0] === wanted[0];
    case "isAnyOf":
    case "hasAnyOf":
      return any;
    case "isNot":
    case "isNoneOf":
    case "hasNoneOf":
      return (cell) => !any(cell);
    case "hasAllOf":
      return (cell) => {
        const ids = cellIds(cell);
        return wanted.every((id) => ids.includes(id));
      };
    case "isExactly":
      return (cell) => sameSet(cellIds(cell), wanted);
    case "isNotExactly":
      return (cell) => !sameSet(cellIds(cell), wanted);
    case "contains":
    case "doesNotContain": {
      const needle = String(wanted[0] ?? "").toLowerCase();
      const contains = (cell: DatabaseCellValue | undefined) =>
        cellItems(cell).some((item) =>
          itemTitle(item).toLowerCase().includes(needle)
        );
      return operator === "contains" ? contains : (cell) => !contains(cell);
    }
    default:
      return null;
  }
}

function listMatcher(
  operator: DatabaseFilterOperator,
  value: DatabaseFilterValue
): CellMatcher | null {
  const wanted = valueList(value);
  const texts = (cell: DatabaseCellValue | undefined) =>
    cellItems(cell).map(itemTitle);
  const needle = String(wanted[0] ?? "").toLowerCase();
  const equalsNeedle = (cell: DatabaseCellValue | undefined) =>
    texts(cell).some((text) => text.toLowerCase() === needle);
  const containsNeedle = (cell: DatabaseCellValue | undefined) =>
    texts(cell).some((text) => text.toLowerCase().includes(needle));
  const any = (cell: DatabaseCellValue | undefined) =>
    texts(cell).some((text) => wanted.includes(text));

  switch (operator) {
    case "is":
      return equalsNeedle;
    case "isNot":
      return (cell) => !equalsNeedle(cell);
    case "contains":
      return containsNeedle;
    case "doesNotContain":
      return (cell) => !containsNeedle(cell);
    case "isAnyOf":
    case "hasAnyOf":
      return any;
    case "isNoneOf":
    case "hasNoneOf":
      return (cell) => !any(cell);
    case "hasAllOf":
      return (cell) => {
        const present = texts(cell);
        return wanted.every((text) => present.includes(text));
      };
    case "isExactly":
      return (cell) => sameSet(texts(cell), wanted);
    case "isNotExactly":
      return (cell) => !sameSet(texts(cell), wanted);
    default:
      return null;
  }
}

function textMatcher(
  operator: DatabaseFilterOperator,
  value: DatabaseFilterValue
): CellMatcher | null {
  const wanted = valueList(value);
  const first = wanted[0] ?? "";
  const textOf = (cell: DatabaseCellValue | undefined) => {
    const [item] = cellItems(cell);
    return item === undefined ? null : itemTitle(item);
  };
  const contains = (cell: DatabaseCellValue | undefined) =>
    (textOf(cell) ?? "").toLowerCase().includes(first.toLowerCase());

  switch (operator) {
    case "is":
      return (cell) => textOf(cell) === first;
    case "isNot":
      return (cell) => textOf(cell) !== first;
    case "contains":
      return contains;
    case "doesNotContain":
      return (cell) => !contains(cell);
    case "isAnyOf":
    case "hasAnyOf":
    case "isExactly":
      return (cell) => wanted.includes(textOf(cell) ?? "");
    case "isNoneOf":
    case "hasNoneOf":
    case "isNotExactly":
      return (cell) => !wanted.includes(textOf(cell) ?? "");
    default:
      return null;
  }
}

function valueList(value: DatabaseFilterValue): string[] {
  if (value === null || isDateFilterValue(value)) {
    return [];
  }
  const items: (string | number | boolean)[] = Array.isArray(value)
    ? value
    : [value];
  return items.map(String);
}

function sameSet(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return (
    left.size === right.size &&
    Array.from(left).every((item) => right.has(item))
  );
}

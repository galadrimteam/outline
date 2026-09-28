import { FILTER_ME, isDateFilterValue } from "@shared/databases/filters";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilter,
  DatabaseFilterItem,
  DatabaseFilterValue,
  DatabaseRecord,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { cellText } from "../utils/cellText";
import {
  cellReferences,
  cellTokens,
  isDateField,
  isEmptyCell,
  isPersonField,
} from "./cellValues";
import { dayIn, dayRangeOf } from "./dateRanges";

/** What a condition is evaluated with besides the row. */
export interface ConditionContext {
  /** The fields of the row's table, by id. */
  fieldsById: Map<string, DatabaseField>;
  /** The email of the person who triggered the automation, for « Me ». */
  actorEmail?: string | null;
  now: Date;
}

/**
 * Tells whether a row matches the conditions of an automation, evaluated in
 * Outline: the filter shape of views, with Teable's meaning for each operator.
 * A rule on a field that no longer exists does not match.
 *
 * @param filter the conditions.
 * @param record the row.
 * @param context the fields, the actor and the current instant.
 * @returns true when the row matches.
 */
export function matchesConditions(
  filter: DatabaseFilter,
  record: DatabaseRecord,
  context: ConditionContext
): boolean {
  const results = filter.filterSet.map((node) =>
    "filterSet" in node
      ? matchesConditions(node, record, context)
      : matchesItem(node, record, context)
  );
  if (!results.length) {
    return true;
  }
  return filter.conjunction === "or"
    ? results.some(Boolean)
    : results.every(Boolean);
}

function matchesItem(
  item: DatabaseFilterItem,
  record: DatabaseRecord,
  context: ConditionContext
): boolean {
  const field = context.fieldsById.get(item.fieldId);
  if (!field) {
    return false;
  }
  const value = record.fields[item.fieldId];

  switch (item.operator) {
    case "isEmpty":
      return isEmptyCell(value);
    case "isNotEmpty":
      return !isEmptyCell(value);
    default:
      break;
  }

  if (isDateFilterValue(item.value) && isDateField(field)) {
    return matchesDate(item, value, context.now);
  }
  if (isPersonField(field) || field.type === DatabaseFieldType.Link) {
    return matchesReferences(item, value, context);
  }
  if (field.cellValueType === "number") {
    return matchesNumber(item, value);
  }
  if (field.cellValueType === "boolean") {
    const checked = value === true;
    const wanted = item.value === true || item.value === "true";
    return item.operator === "isNot" ? checked !== wanted : checked === wanted;
  }
  return matchesText(item, value);
}

function matchesText(
  item: DatabaseFilterItem,
  value: DatabaseCellValue | undefined
): boolean {
  const tokens = cellTokens(value).map(normalize);
  const text = normalize(cellText(value));
  const wanted = filterStrings(item.value).map(normalize);
  const first = wanted[0] ?? "";

  switch (item.operator) {
    case "is":
      return text === first || tokens.includes(first);
    case "isNot":
      return !(text === first || tokens.includes(first));
    case "contains":
      return text.includes(first);
    case "doesNotContain":
      return !text.includes(first);
    case "isAnyOf":
    case "hasAnyOf":
      return tokens.some((token) => wanted.includes(token));
    case "isNoneOf":
    case "hasNoneOf":
      return !tokens.some((token) => wanted.includes(token));
    case "hasAllOf":
      return wanted.every((token) => tokens.includes(token));
    case "isExactly":
      return sameSet(tokens, wanted);
    case "isNotExactly":
      return !sameSet(tokens, wanted);
    default:
      return false;
  }
}

function matchesNumber(
  item: DatabaseFilterItem,
  value: DatabaseCellValue | undefined
): boolean {
  const actual = typeof value === "number" ? value : Number(cellText(value));
  const wanted = Number(item.value);
  if (Number.isNaN(actual) || Number.isNaN(wanted) || isEmptyCell(value)) {
    return item.operator === "isNot";
  }
  switch (item.operator) {
    case "is":
      return actual === wanted;
    case "isNot":
      return actual !== wanted;
    case "isGreater":
      return actual > wanted;
    case "isGreaterEqual":
      return actual >= wanted;
    case "isLess":
      return actual < wanted;
    case "isLessEqual":
      return actual <= wanted;
    default:
      return false;
  }
}

function matchesReferences(
  item: DatabaseFilterItem,
  value: DatabaseCellValue | undefined,
  context: ConditionContext
): boolean {
  const items = cellReferences(value);
  const wanted = filterStrings(item.value).flatMap((entry) =>
    entry === FILTER_ME
      ? context.actorEmail
        ? [context.actorEmail.toLowerCase()]
        : []
      : [entry]
  );
  const isWanted = (keys: string[]) => keys.some((key) => wanted.includes(key));
  const isPresent = (entry: string) =>
    items.some((keys) => keys.includes(entry));
  const exactly =
    wanted.length > 0 && wanted.every(isPresent) && items.every(isWanted);

  switch (item.operator) {
    case "is":
    case "isAnyOf":
    case "hasAnyOf":
      return items.some(isWanted);
    case "isNot":
    case "isNoneOf":
    case "hasNoneOf":
      return !items.some(isWanted);
    case "hasAllOf":
      return wanted.length > 0 && wanted.every(isPresent);
    case "isExactly":
      return exactly;
    case "isNotExactly":
      return !exactly;
    default:
      return false;
  }
}

function matchesDate(
  item: DatabaseFilterItem,
  value: DatabaseCellValue | undefined,
  now: Date
): boolean {
  if (!isDateFilterValue(item.value) || typeof value !== "string") {
    return item.operator === "isNot";
  }
  const range = dayRangeOf(item.value, now);
  const date = new Date(value);
  if (!range || Number.isNaN(date.getTime())) {
    return false;
  }
  const day = dayIn(date, item.value.timeZone);

  switch (item.operator) {
    case "is":
    case "isWithIn":
      return day >= range.start && day <= range.end;
    case "isNot":
      return day < range.start || day > range.end;
    case "isBefore":
      return day < range.start;
    case "isAfter":
      return day > range.end;
    case "isOnOrBefore":
      return day <= range.end;
    case "isOnOrAfter":
      return day >= range.start;
    default:
      return false;
  }
}

function filterStrings(value: DatabaseFilterValue): string[] {
  if (value === null || typeof value === "object") {
    return Array.isArray(value) ? value : [];
  }
  return [String(value)];
}

function normalize(text: string): string {
  return text.trim().toLocaleLowerCase();
}

function sameSet(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((item) => right.has(item));
}

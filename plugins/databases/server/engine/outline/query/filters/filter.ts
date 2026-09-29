import type {
  DatabaseCellValue,
  DatabaseFilter,
  DatabaseFilterItem,
} from "@shared/databases/types";
import { FILTER_ME, isFilterGroup } from "@shared/databases/filters";
import type { QueryField } from "../fields";
import { isUserType } from "../fields";
import type { MatcherContext } from "./cellMatchers";
import { cellMatcher } from "./cellMatchers";

/** Tells whether a record, by its cells, passes a filter. */
export type RecordPredicate = (
  cells: Record<string, DatabaseCellValue>
) => boolean;

/** What a filter needs besides the fields: the reader and the clock. */
export interface FilterContext extends MatcherContext {
  /** Engine user id standing for `Me`; without it `Me` matches nobody. */
  userId?: string;
}

/**
 * Compiles a filter tree, groups nested to any depth, each joined by its own
 * conjunction. As Teable does, a rule on an unknown field or without a value
 * (null or an empty list) is dropped, a checkbox rule or an emptiness test
 * needing none, and so is a group left without rules; `Me` in a person rule
 * is the reader.
 *
 * @param filter the filter.
 * @param fields the table's fields by id.
 * @param context the reader, the current instant and default zone.
 * @returns the predicate, or null when nothing is left to test.
 */
export function compileFilter(
  filter: DatabaseFilter | null | undefined,
  fields: Map<string, QueryField>,
  context: FilterContext
): RecordPredicate | null {
  if (!filter) {
    return null;
  }
  const tests = filter.filterSet.flatMap((node) => {
    const test = isFilterGroup(node)
      ? compileFilter(node, fields, context)
      : compileItem(node, fields, context);
    return test ? [test] : [];
  });
  if (!tests.length) {
    return null;
  }
  if (tests.length === 1) {
    return tests[0];
  }
  return filter.conjunction === "or"
    ? (cells) => tests.some((test) => test(cells))
    : (cells) => tests.every((test) => test(cells));
}

/**
 * Joins two filters with "and", either possibly absent.
 *
 * @param a a filter.
 * @param b another filter.
 * @returns the filter both describe, or null for none.
 */
export function andFilters(
  a: DatabaseFilter | null | undefined,
  b: DatabaseFilter | null | undefined
): DatabaseFilter | null {
  if (!a) {
    return b ?? null;
  }
  if (!b) {
    return a;
  }
  return { conjunction: "and", filterSet: [a, b] };
}

function compileItem(
  item: DatabaseFilterItem,
  fields: Map<string, QueryField>,
  context: FilterContext
): RecordPredicate | null {
  const field = fields.get(item.fieldId);
  if (!field) {
    return null;
  }
  const value = isUserType(field.type)
    ? withMe(item.value, context.userId)
    : item.value;
  const needsValue =
    item.operator !== "isEmpty" &&
    item.operator !== "isNotEmpty" &&
    field.cellValueType !== "boolean";
  const missing =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0);
  if (needsValue && missing) {
    return null;
  }
  const matches = cellMatcher(field, item.operator, value, context);
  if (!matches) {
    return null;
  }
  const fieldId = field.id;
  return (cells) => matches(cells[fieldId]);
}

function withMe(
  value: DatabaseFilterItem["value"],
  userId: string | undefined
): DatabaseFilterItem["value"] {
  if (!userId) {
    return value;
  }
  if (value === FILTER_ME) {
    return userId;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === FILTER_ME ? userId : item));
  }
  return value;
}

/**
 * Filter operators allowed per field, default values and filter tree helpers.
 *
 * `getValidFilterOperators` and the date mode lists are derived from Teable's
 * `packages/core/src/models/view/filter/operator.ts` and `filter-item.ts`
 * (https://github.com/teableio/teable, `packages/core/LICENSE`), used under
 * the MIT License:
 *
 * Copyright (c) 2023-2025 Teable, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { TFunction } from "i18next";
import type {
  DatabaseCellValueType,
  DatabaseDateFilterMode,
  DatabaseDateFilterValue,
  DatabaseField,
  DatabaseFilter,
  DatabaseFilterConjunction,
  DatabaseFilterItem,
  DatabaseFilterOperator,
  DatabaseFilterValue,
} from "./types";
import { DatabaseFieldType } from "./types";

/** The field properties that decide which operators apply. */
export type FilterableField = Pick<
  DatabaseField,
  "type" | "cellValueType" | "isMultipleCellValue"
>;

/** A node of a filter tree: a rule or a nested group. */
export type DatabaseFilterNode = DatabaseFilterItem | DatabaseFilter;

/** Path of a node in a filter tree: indexes into `filterSet`, from the root. */
export type FilterPath = number[];

/** Groups can be nested this many levels deep, the root group included (Notion's limit). */
export const MAX_FILTER_DEPTH = 3;

/** The value standing for the signed-in person in user filters. */
export const FILTER_ME = "Me";

/** How the value editor of an operator looks. */
export type FilterValueKind = "none" | "list" | "date" | "single";

const textOperators: DatabaseFilterOperator[] = [
  "is",
  "isNot",
  "contains",
  "doesNotContain",
  "isEmpty",
  "isNotEmpty",
];

const numberOperators: DatabaseFilterOperator[] = [
  "is",
  "isNot",
  "isGreater",
  "isGreaterEqual",
  "isLess",
  "isLessEqual",
  "isEmpty",
  "isNotEmpty",
];

const booleanOperators: DatabaseFilterOperator[] = ["is"];

const dateOperators: DatabaseFilterOperator[] = [
  "is",
  "isNot",
  "isWithIn",
  "isBefore",
  "isAfter",
  "isOnOrBefore",
  "isOnOrAfter",
  "isEmpty",
  "isNotEmpty",
];

const multipleSelectOperators: DatabaseFilterOperator[] = [
  "hasAnyOf",
  "hasAllOf",
  "isExactly",
  "isNotExactly",
  "hasNoneOf",
  "isEmpty",
  "isNotEmpty",
];

const noValueOperators: DatabaseFilterOperator[] = ["isEmpty", "isNotEmpty"];

const listOperators: DatabaseFilterOperator[] = [
  "isAnyOf",
  "isNoneOf",
  "hasAnyOf",
  "hasAllOf",
  "hasNoneOf",
  "isExactly",
  "isNotExactly",
];

/** Date modes offered with every date operator but "is within". */
export const DATE_FILTER_MODES: DatabaseDateFilterMode[] = [
  "today",
  "tomorrow",
  "yesterday",
  "currentWeek",
  "lastWeek",
  "nextWeekPeriod",
  "currentMonth",
  "lastMonth",
  "nextMonthPeriod",
  "currentYear",
  "lastYear",
  "nextYearPeriod",
  "oneWeekAgo",
  "oneWeekFromNow",
  "oneMonthAgo",
  "oneMonthFromNow",
  "daysAgo",
  "daysFromNow",
  "exactDate",
];

/** Date modes offered with "is within": a window ending or starting today. */
export const DATE_WITHIN_FILTER_MODES: DatabaseDateFilterMode[] = [
  "pastWeek",
  "pastMonth",
  "pastYear",
  "nextWeek",
  "nextMonth",
  "nextYear",
  "pastNumberOfDays",
  "nextNumberOfDays",
  ...DATE_FILTER_MODES,
];

const modesRequiringDays: DatabaseDateFilterMode[] = [
  "daysAgo",
  "daysFromNow",
  "pastNumberOfDays",
  "nextNumberOfDays",
];

const modesRequiringDate: DatabaseDateFilterMode[] = [
  "exactDate",
  "exactFormatDate",
];

/**
 * Returns the operators a filter on this field may use, most useful first.
 *
 * @param field the field to filter on.
 * @returns the valid operators, empty when the field cannot be filtered.
 */
export function getValidFilterOperators(
  field: FilterableField
): DatabaseFilterOperator[] {
  if (field.type === DatabaseFieldType.Button) {
    return [];
  }

  let operators = operatorsForValueType(field.cellValueType);

  switch (field.type) {
    case DatabaseFieldType.SingleSelect: {
      if (field.isMultipleCellValue) {
        operators = [...multipleSelectOperators];
        break;
      }
      operators = operators.filter(
        (operator) => operator !== "contains" && operator !== "doesNotContain"
      );
      operators.splice(2, 0, "isAnyOf", "isNoneOf");
      break;
    }
    case DatabaseFieldType.MultipleSelect: {
      operators = [...multipleSelectOperators];
      break;
    }
    case DatabaseFieldType.User:
    case DatabaseFieldType.CreatedBy:
    case DatabaseFieldType.LastModifiedBy:
    case DatabaseFieldType.Link: {
      operators = field.isMultipleCellValue
        ? ["hasAnyOf", "hasAllOf", "isExactly", "hasNoneOf", "isNotExactly"]
        : ["is", "isNot", "isAnyOf", "isNoneOf"];
      if (field.type === DatabaseFieldType.Link) {
        operators.push("contains", "doesNotContain");
      }
      operators.push("isEmpty", "isNotEmpty");
      break;
    }
    case DatabaseFieldType.Attachment: {
      operators = ["isEmpty", "isNotEmpty"];
      break;
    }
  }

  return Array.from(new Set(operators));
}

/**
 * Whether a field can be used in a filter.
 *
 * @param field the field.
 * @returns true when at least one operator applies.
 */
export function isFilterableField(field: FilterableField): boolean {
  return getValidFilterOperators(field).length > 0;
}

/**
 * Returns the operator a new rule on this field starts with, like Notion does:
 * "contains" for text, "is" for single values, "has any of" for lists.
 *
 * @param field the field of the rule.
 * @returns the default operator, or undefined when the field cannot be filtered.
 */
export function getDefaultFilterOperator(
  field: FilterableField
): DatabaseFilterOperator | undefined {
  const operators = getValidFilterOperators(field);
  const isText =
    field.cellValueType === "string" &&
    (field.type === DatabaseFieldType.SingleLineText ||
      field.type === DatabaseFieldType.LongText ||
      field.type === DatabaseFieldType.Formula ||
      field.type === DatabaseFieldType.AutoNumber);

  if (isText && operators.includes("contains")) {
    return "contains";
  }
  return operators[0];
}

/**
 * Tells which kind of value editor an operator needs on a field.
 *
 * @param field the field of the rule.
 * @param operator the operator of the rule.
 * @returns "none" (no value), "list" (several values), "date" (a date mode) or "single".
 */
export function getFilterValueKind(
  field: FilterableField,
  operator: DatabaseFilterOperator
): FilterValueKind {
  if (noValueOperators.includes(operator)) {
    return "none";
  }
  if (listOperators.includes(operator)) {
    return "list";
  }
  if (field.cellValueType === "dateTime") {
    return "date";
  }
  return "single";
}

/**
 * Whether the operator takes no value (the value editor is hidden).
 *
 * @param operator the operator.
 * @returns true for "is empty" and "is not empty".
 */
export function operatorHidesValue(operator: DatabaseFilterOperator): boolean {
  return noValueOperators.includes(operator);
}

/**
 * Returns the date modes an operator offers.
 *
 * @param operator a date operator.
 * @returns the modes, the "is within" windows first for `isWithIn`.
 */
export function getDateFilterModes(
  operator: DatabaseFilterOperator
): DatabaseDateFilterMode[] {
  return operator === "isWithIn" ? DATE_WITHIN_FILTER_MODES : DATE_FILTER_MODES;
}

/**
 * Whether a date mode needs a number of days.
 *
 * @param mode the date mode.
 * @returns true for the "number of days" modes.
 */
export function dateModeNeedsDays(mode: DatabaseDateFilterMode): boolean {
  return modesRequiringDays.includes(mode);
}

/**
 * Whether a date mode needs an exact date.
 *
 * @param mode the date mode.
 * @returns true for the exact date modes.
 */
export function dateModeNeedsDate(mode: DatabaseDateFilterMode): boolean {
  return modesRequiringDate.includes(mode);
}

/**
 * Builds a date filter value, keeping the extra keys the mode needs.
 *
 * @param mode the date mode.
 * @param timeZone the reader's IANA time zone.
 * @param previous the value being replaced, whose date or days are reused.
 * @returns the date value.
 */
export function buildDateFilterValue(
  mode: DatabaseDateFilterMode,
  timeZone: string,
  previous?: DatabaseDateFilterValue
): DatabaseDateFilterValue {
  const value: DatabaseDateFilterValue = { mode, timeZone };
  if (dateModeNeedsDays(mode)) {
    value.numberOfDays = previous?.numberOfDays ?? 7;
  }
  if (dateModeNeedsDate(mode)) {
    value.exactDate = previous?.exactDate ?? new Date().toISOString();
  }
  return value;
}

/**
 * Returns the value a rule starts with once its operator is chosen.
 *
 * @param field the field of the rule.
 * @param operator the operator of the rule.
 * @param timeZone the reader's IANA time zone, used by date values.
 * @returns the default value: null when the reader still has to type one.
 */
export function getDefaultFilterValue(
  field: FilterableField,
  operator: DatabaseFilterOperator,
  timeZone: string
): DatabaseFilterValue {
  switch (getFilterValueKind(field, operator)) {
    case "none":
      return null;
    case "list":
      return [];
    case "date":
      return buildDateFilterValue(
        operator === "isWithIn" ? "pastWeek" : "today",
        timeZone
      );
    case "single":
      return field.cellValueType === "boolean" ? true : null;
  }
}

/**
 * Builds a new rule on a field with its default operator and value.
 *
 * @param field the field to filter on.
 * @param timeZone the reader's IANA time zone.
 * @returns the rule, or undefined when the field cannot be filtered.
 */
export function createFilterItem(
  field: DatabaseField,
  timeZone: string
): DatabaseFilterItem | undefined {
  const operator = getDefaultFilterOperator(field);
  if (!operator) {
    return undefined;
  }
  return {
    fieldId: field.id,
    operator,
    value: getDefaultFilterValue(field, operator, timeZone),
  };
}

/**
 * Moves a rule to another field, keeping its operator when still valid.
 *
 * @param item the rule.
 * @param field the new field.
 * @param timeZone the reader's IANA time zone.
 * @returns the updated rule.
 */
export function changeFilterItemField(
  item: DatabaseFilterItem,
  field: DatabaseField,
  timeZone: string
): DatabaseFilterItem {
  const operators = getValidFilterOperators(field);
  const operator = operators.includes(item.operator)
    ? item.operator
    : (getDefaultFilterOperator(field) ?? item.operator);
  return {
    fieldId: field.id,
    operator,
    value: getDefaultFilterValue(field, operator, timeZone),
  };
}

/**
 * Changes the operator of a rule, keeping its value when it still fits.
 *
 * @param item the rule.
 * @param field the field of the rule.
 * @param operator the new operator.
 * @param timeZone the reader's IANA time zone.
 * @returns the updated rule.
 */
export function changeFilterItemOperator(
  item: DatabaseFilterItem,
  field: FilterableField,
  operator: DatabaseFilterOperator,
  timeZone: string
): DatabaseFilterItem {
  const before = getFilterValueKind(field, item.operator);
  const after = getFilterValueKind(field, operator);

  if (before !== after) {
    return {
      ...item,
      operator,
      value: getDefaultFilterValue(field, operator, timeZone),
    };
  }

  if (after === "date" && isDateFilterValue(item.value)) {
    const modes = getDateFilterModes(operator);
    return {
      ...item,
      operator,
      value: modes.includes(item.value.mode)
        ? item.value
        : getDefaultFilterValue(field, operator, timeZone),
    };
  }

  return { ...item, operator };
}

/**
 * Whether a filter value is a date mode value.
 *
 * @param value a filter value.
 * @returns true when the value carries a date mode.
 */
export function isDateFilterValue(
  value: DatabaseFilterValue
): value is DatabaseDateFilterValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "mode" in value
  );
}

/**
 * Whether a node of a filter tree is a group.
 *
 * @param node a rule or a group.
 * @returns true for a group.
 */
export function isFilterGroup(
  node: DatabaseFilterNode
): node is DatabaseFilter {
  return "filterSet" in node;
}

/**
 * Whether a rule has everything it needs to be sent to the engine.
 *
 * @param item the rule.
 * @param field the field of the rule, when it still exists.
 * @returns true when the rule can be applied.
 */
export function isFilterItemComplete(
  item: DatabaseFilterItem,
  field: FilterableField | undefined
): boolean {
  if (!field || !getValidFilterOperators(field).includes(item.operator)) {
    return false;
  }

  const value = item.value;
  switch (getFilterValueKind(field, item.operator)) {
    case "none":
      return true;
    case "list":
      return Array.isArray(value) && value.length > 0;
    case "date": {
      if (!isDateFilterValue(value)) {
        return false;
      }
      if (!getDateFilterModes(item.operator).includes(value.mode)) {
        return false;
      }
      if (dateModeNeedsDays(value.mode)) {
        return (
          typeof value.numberOfDays === "number" &&
          Number.isInteger(value.numberOfDays) &&
          value.numberOfDays >= 0
        );
      }
      if (dateModeNeedsDate(value.mode)) {
        return !!value.exactDate;
      }
      return true;
    }
    case "single":
      if (field.cellValueType === "boolean") {
        return value === true || value === false || value === null;
      }
      if (typeof value === "number") {
        return Number.isFinite(value);
      }
      return typeof value === "string" && value.trim() !== "";
  }
}

/**
 * Removes the rules that cannot be applied (unknown field, missing value) and
 * the groups left empty, so the rest can be sent to the engine.
 *
 * @param filter the filter being edited.
 * @param fieldById looks a field up by id.
 * @returns the applicable filter, or null when nothing is left.
 */
export function sanitizeFilter(
  filter: DatabaseFilter | null | undefined,
  fieldById: (id: string) => FilterableField | undefined
): DatabaseFilter | null {
  if (!filter) {
    return null;
  }

  const filterSet: DatabaseFilterNode[] = [];
  for (const node of filter.filterSet) {
    if (isFilterGroup(node)) {
      const group = sanitizeFilter(node, fieldById);
      if (group) {
        filterSet.push(group);
      }
    } else if (isFilterItemComplete(node, fieldById(node.fieldId))) {
      filterSet.push(node);
    }
  }

  return filterSet.length
    ? { conjunction: filter.conjunction, filterSet }
    : null;
}

/**
 * Returns a filter with no empty group, or null when it has no rule, so two
 * filters meaning the same thing compare equal.
 *
 * @param filter a filter.
 * @returns the normalized filter.
 */
export function normalizeFilter(
  filter: DatabaseFilter | null | undefined
): DatabaseFilter | null {
  if (!filter) {
    return null;
  }
  const filterSet: DatabaseFilterNode[] = [];
  for (const node of filter.filterSet) {
    if (isFilterGroup(node)) {
      const group = normalizeFilter(node);
      if (group) {
        filterSet.push(group);
      }
    } else {
      filterSet.push(node);
    }
  }
  return filterSet.length
    ? { conjunction: filter.conjunction, filterSet }
    : null;
}

/**
 * Whether two filters are the same once normalized.
 *
 * @param a a filter.
 * @param b another filter.
 * @returns true when they would give the same rows.
 */
export function filtersEqual(
  a: DatabaseFilter | null | undefined,
  b: DatabaseFilter | null | undefined
): boolean {
  return (
    JSON.stringify(normalizeFilter(a)) === JSON.stringify(normalizeFilter(b))
  );
}

/**
 * Counts the rules of a filter, nested groups included.
 *
 * @param filter a filter.
 * @returns the number of rules.
 */
export function countFilterRules(
  filter: DatabaseFilter | null | undefined
): number {
  if (!filter) {
    return 0;
  }
  return filter.filterSet.reduce(
    (count, node) => count + (isFilterGroup(node) ? countFilterRules(node) : 1),
    0
  );
}

/**
 * Returns how deep groups are nested, the root group counting as one.
 *
 * @param filter a filter.
 * @returns the depth.
 */
export function filterDepth(filter: DatabaseFilter): number {
  return (
    1 +
    filter.filterSet.reduce(
      (depth, node) =>
        isFilterGroup(node) ? Math.max(depth, filterDepth(node)) : depth,
      0
    )
  );
}

/**
 * Whether a filter only has rules at its root, which the simple editor can show.
 *
 * @param filter a filter.
 * @returns true when no group is nested.
 */
export function isSimpleFilter(
  filter: DatabaseFilter | null | undefined
): boolean {
  return !filter || filter.filterSet.every((node) => !isFilterGroup(node));
}

/**
 * Returns the node at a path.
 *
 * @param filter the root group.
 * @param path indexes from the root; empty for the root itself.
 * @returns the node, or undefined when the path does not exist.
 */
export function getFilterNode(
  filter: DatabaseFilter,
  path: FilterPath
): DatabaseFilterNode | undefined {
  let node: DatabaseFilterNode = filter;
  for (const index of path) {
    if (!isFilterGroup(node)) {
      return undefined;
    }
    const child: DatabaseFilterNode | undefined = node.filterSet[index];
    if (!child) {
      return undefined;
    }
    node = child;
  }
  return node;
}

/**
 * Replaces the node at a path.
 *
 * @param filter the root group.
 * @param path indexes from the root; empty replaces the root.
 * @param next the new node; the root must stay a group.
 * @returns a new root group.
 */
export function updateFilterNode(
  filter: DatabaseFilter,
  path: FilterPath,
  next: DatabaseFilterNode
): DatabaseFilter {
  if (!path.length) {
    return isFilterGroup(next) ? next : filter;
  }
  const [index, ...rest] = path;
  const child = filter.filterSet[index];
  if (!child) {
    return filter;
  }
  const filterSet = [...filter.filterSet];
  filterSet[index] = rest.length
    ? isFilterGroup(child)
      ? updateFilterNode(child, rest, next)
      : child
    : next;
  return { ...filter, filterSet };
}

/**
 * Removes the node at a path; a nested group left empty goes too.
 *
 * @param filter the root group.
 * @param path indexes from the root, not empty.
 * @returns a new root group.
 */
export function removeFilterNode(
  filter: DatabaseFilter,
  path: FilterPath
): DatabaseFilter {
  if (!path.length) {
    return { ...filter, filterSet: [] };
  }
  const [index, ...rest] = path;
  const child = filter.filterSet[index];
  if (!child) {
    return filter;
  }
  if (!rest.length || !isFilterGroup(child)) {
    return {
      ...filter,
      filterSet: filter.filterSet.filter((_, i) => i !== index),
    };
  }
  const group = removeFilterNode(child, rest);
  const filterSet = [...filter.filterSet];
  if (group.filterSet.length) {
    filterSet[index] = group;
  } else {
    filterSet.splice(index, 1);
  }
  return { ...filter, filterSet };
}

/**
 * Appends a node to the group at a path.
 *
 * @param filter the root group.
 * @param groupPath the path of the group; empty for the root.
 * @param node the rule or group to add.
 * @returns a new root group, unchanged when the path is not a group or a
 * group would be nested deeper than `MAX_FILTER_DEPTH`.
 */
export function appendFilterNode(
  filter: DatabaseFilter,
  groupPath: FilterPath,
  node: DatabaseFilterNode
): DatabaseFilter {
  const group = getFilterNode(filter, groupPath);
  if (!group || !isFilterGroup(group)) {
    return filter;
  }
  if (
    isFilterGroup(node) &&
    groupPath.length + 1 + filterDepth(node) > MAX_FILTER_DEPTH
  ) {
    return filter;
  }
  return updateFilterNode(filter, groupPath, {
    ...group,
    filterSet: [...group.filterSet, node],
  });
}

/**
 * Whether a group at a path may receive a nested group.
 *
 * @param groupPath the path of the group; empty for the root.
 * @returns true while the new group stays within `MAX_FILTER_DEPTH`.
 */
export function canNestFilterGroup(groupPath: FilterPath): boolean {
  return groupPath.length + 2 <= MAX_FILTER_DEPTH;
}

/**
 * Sets the conjunction of the group at a path.
 *
 * @param filter the root group.
 * @param groupPath the path of the group; empty for the root.
 * @param conjunction "and" or "or".
 * @returns a new root group.
 */
export function setFilterConjunction(
  filter: DatabaseFilter,
  groupPath: FilterPath,
  conjunction: DatabaseFilterConjunction
): DatabaseFilter {
  const group = getFilterNode(filter, groupPath);
  if (!group || !isFilterGroup(group)) {
    return filter;
  }
  return updateFilterNode(filter, groupPath, { ...group, conjunction });
}

/**
 * Returns an empty root group.
 *
 * @returns a filter without rules.
 */
export function emptyFilter(): DatabaseFilter {
  return { conjunction: "and", filterSet: [] };
}

/**
 * Returns the label of an operator, in the reader's language.
 *
 * @param operator the operator.
 * @param t the translation function.
 * @param cellValueType the value type of the field, numbers use symbols.
 * @returns the label.
 */
export function filterOperatorLabel(
  operator: DatabaseFilterOperator,
  t: TFunction,
  cellValueType?: DatabaseCellValueType
): string {
  if (cellValueType === "number") {
    switch (operator) {
      case "is":
        return "=";
      case "isNot":
        return "≠";
      case "isGreater":
        return ">";
      case "isGreaterEqual":
        return "≥";
      case "isLess":
        return "<";
      case "isLessEqual":
        return "≤";
      default:
        break;
    }
  }

  switch (operator) {
    case "is":
      return t("Is");
    case "isNot":
      return t("Is not");
    case "contains":
      return t("Contains");
    case "doesNotContain":
      return t("Does not contain");
    case "isGreater":
      return t("Is greater than");
    case "isGreaterEqual":
      return t("Is greater than or equal to");
    case "isLess":
      return t("Is less than");
    case "isLessEqual":
      return t("Is less than or equal to");
    case "isEmpty":
      return t("Is empty");
    case "isNotEmpty":
      return t("Is not empty");
    case "isAnyOf":
      return t("Is any of");
    case "isNoneOf":
      return t("Is none of");
    case "hasAnyOf":
      return t("Has any of");
    case "hasAllOf":
      return t("Has all of");
    case "hasNoneOf":
      return t("Has none of");
    case "isExactly":
      return t("Is exactly");
    case "isNotExactly":
      return t("Is not exactly");
    case "isWithIn":
      return t("Is within");
    case "isBefore":
      return t("Is before");
    case "isAfter":
      return t("Is after");
    case "isOnOrBefore":
      return t("Is on or before");
    case "isOnOrAfter":
      return t("Is on or after");
  }
}

/**
 * Returns the label of a date mode, in the reader's language.
 *
 * @param mode the date mode.
 * @param t the translation function.
 * @returns the label.
 */
export function dateFilterModeLabel(
  mode: DatabaseDateFilterMode,
  t: TFunction
): string {
  switch (mode) {
    case "today":
      return t("Today");
    case "tomorrow":
      return t("Tomorrow");
    case "yesterday":
      return t("Yesterday");
    case "currentWeek":
      return t("This week");
    case "currentMonth":
      return t("This month");
    case "currentYear":
      return t("This year");
    case "lastWeek":
      return t("Last week");
    case "lastMonth":
      return t("Last month");
    case "lastYear":
      return t("Last year");
    case "nextWeekPeriod":
      return t("Next week");
    case "nextMonthPeriod":
      return t("Next month");
    case "nextYearPeriod":
      return t("Next year");
    case "oneWeekAgo":
      return t("One week ago");
    case "oneWeekFromNow":
      return t("One week from now");
    case "oneMonthAgo":
      return t("One month ago");
    case "oneMonthFromNow":
      return t("One month from now");
    case "daysAgo":
      return t("Number of days ago");
    case "daysFromNow":
      return t("Number of days from now");
    case "exactDate":
    case "exactFormatDate":
      return t("Exact date");
    case "dateRange":
      return t("Date range");
    case "pastWeek":
      return t("The past week");
    case "pastMonth":
      return t("The past month");
    case "pastYear":
      return t("The past year");
    case "nextWeek":
      return t("The next week");
    case "nextMonth":
      return t("The next month");
    case "nextYear":
      return t("The next year");
    case "pastNumberOfDays":
      return t("The past number of days");
    case "nextNumberOfDays":
      return t("The next number of days");
  }
}

/**
 * Returns the label of a conjunction, in the reader's language.
 *
 * @param conjunction "and" or "or".
 * @param t the translation function.
 * @returns the label.
 */
export function filterConjunctionLabel(
  conjunction: DatabaseFilterConjunction,
  t: TFunction
): string {
  return conjunction === "and" ? t("And") : t("Or");
}

function operatorsForValueType(
  cellValueType: DatabaseCellValueType
): DatabaseFilterOperator[] {
  switch (cellValueType) {
    case "string":
      return [...textOperators];
    case "number":
      return [...numberOperators];
    case "boolean":
      return [...booleanOperators];
    case "dateTime":
      return [...dateOperators];
  }
}

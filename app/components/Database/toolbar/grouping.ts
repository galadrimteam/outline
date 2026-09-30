import { format } from "date-fns";
import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroupLayout,
  DatabaseLinkValue,
  DatabaseRecord,
  DatabaseSortOrder,
  DatabaseUserValue,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";

/** Rows sharing one value of the grouping field. */
export interface RecordGroup {
  /** Stable key: the choice name, the user or record id, the day…; "" for the empty group. */
  key: string;
  /** Text used to order groups. */
  label: string;
  /** The value to draw in the group header, shaped like a cell of the field; undefined for the empty group. */
  value: DatabaseCellValue | undefined;
  records: DatabaseRecord[];
}

interface GroupValue {
  key: string;
  label: string;
  value: DatabaseCellValue | undefined;
}

/**
 * Splits rows into groups by a field, like Notion: a row with several values
 * (tags, people, relations) appears in the group of each value, the empty
 * group comes first, select groups follow the order of their options. A
 * view's own order of its groups comes before that, and the groups it folds
 * away are left out.
 *
 * @param records the rows, in view order (kept inside each group).
 * @param field the grouping field.
 * @param order the direction of the groups.
 * @param layout the order and the folded groups of the view.
 * @returns the groups, empty ones left out.
 */
export function groupRecords(
  records: DatabaseRecord[],
  field: DatabaseField,
  order: DatabaseSortOrder = "asc",
  layout?: DatabaseGroupLayout
): RecordGroup[] {
  const groups = new Map<string, RecordGroup>();

  for (const record of records) {
    for (const entry of groupValues(field, record.fields[field.id])) {
      let group = groups.get(entry.key);
      if (!group) {
        group = { ...entry, records: [] };
        groups.set(entry.key, group);
      }
      if (!group.records.includes(record)) {
        group.records.push(record);
      }
    }
  }

  const empty = groups.get("");
  const filled = Array.from(groups.values()).filter((g) => g.key !== "");
  const compare = groupComparator(field);
  filled.sort(compare);
  if (order === "desc") {
    filled.reverse();
  }
  const natural = empty ? [empty, ...filled] : filled;
  const hidden = new Set(layout?.hidden ?? []);
  const ranks = new Map(
    (layout?.order ?? []).map((key, index) => [key, index])
  );
  const rank = (group: RecordGroup) =>
    ranks.get(group.key) ?? Number.POSITIVE_INFINITY;
  return natural
    .filter((group) => !hidden.has(group.key))
    .map((group, index) => ({ group, index }))
    .sort(
      (a, b) => compareRanks(rank(a.group), rank(b.group)) || a.index - b.index
    )
    .map(({ group }) => group);
}

/**
 * The order and the folded groups a view gives its groups, from its overrides.
 *
 * @param overrides the overrides of the view.
 * @returns the group layout.
 */
export function viewGroupLayout(
  overrides: Pick<DatabaseViewOverrides, "stackOrder" | "hiddenStacks">
): DatabaseGroupLayout {
  return { order: overrides.stackOrder, hidden: overrides.hiddenStacks };
}

/**
 * Returns the group keys and header values of one cell.
 *
 * @param field the grouping field.
 * @param value the cell value.
 * @returns one entry per value; the empty entry when the cell is empty.
 */
export function groupValues(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): GroupValue[] {
  if (field.cellValueType === "boolean" && !Array.isArray(value)) {
    return [
      value === true
        ? { key: "true", label: "1", value: true }
        : { key: "false", label: "0", value: false },
    ];
  }

  if (value === undefined || value === null || value === "") {
    return [emptyGroupValue];
  }

  if (Array.isArray(value)) {
    const entries: GroupValue[] = [];
    for (const element of value) {
      const entry = scalarGroupValue(field, element);
      if (entry && !entries.some((e) => e.key === entry.key)) {
        entries.push({ ...entry, value: wrap(element) });
      }
    }
    return entries.length ? entries : [emptyGroupValue];
  }

  return [scalarGroupValue(field, value) ?? emptyGroupValue];
}

/**
 * Returns the cell to write so that a new row lands in a group.
 *
 * @param field the grouping field.
 * @param group the group.
 * @returns the cell input, or undefined when the field cannot be prefilled.
 */
export function groupPrefill(
  field: DatabaseField,
  group: Pick<RecordGroup, "key" | "value">
): DatabaseCellInput | undefined {
  if (field.isComputed || field.isLookup) {
    return undefined;
  }
  if (group.key === "") {
    return undefined;
  }

  switch (field.type) {
    case DatabaseFieldType.SingleSelect:
    case DatabaseFieldType.SingleLineText:
    case DatabaseFieldType.LongText:
      return group.key;
    case DatabaseFieldType.MultipleSelect:
      return [group.key];
    case DatabaseFieldType.Checkbox:
      return group.key === "true";
    case DatabaseFieldType.Number:
    case DatabaseFieldType.Rating:
      return Number(group.key);
    case DatabaseFieldType.User: {
      const users = asArray(group.value).filter(isUserValue);
      const outlineUserId = users[0]?.outlineUserId;
      if (!outlineUserId) {
        return undefined;
      }
      return field.isMultipleCellValue
        ? [{ outlineUserId }]
        : { outlineUserId };
    }
    case DatabaseFieldType.Link: {
      const link = { id: group.key };
      return field.isMultipleCellValue ? [link] : link;
    }
    default:
      return undefined;
  }
}

const emptyGroupValue: GroupValue = { key: "", label: "", value: undefined };

function scalarGroupValue(
  field: DatabaseField,
  value: unknown
): GroupValue | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return { key: String(value), label: String(value), value };
  }
  if (typeof value === "boolean") {
    return {
      key: String(value),
      label: value ? "1" : "0",
      value,
    };
  }
  if (typeof value === "string") {
    if (field.cellValueType === "dateTime") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        const day = format(date, "yyyy-MM-dd");
        return { key: day, label: day, value };
      }
    }
    return { key: value, label: value, value };
  }
  if (isUserValue(value)) {
    return { key: value.id, label: value.title, value };
  }
  if (isLinkValue(value)) {
    return { key: value.id, label: value.title ?? value.id, value };
  }
  return undefined;
}

function wrap(element: unknown): DatabaseCellValue | undefined {
  if (typeof element === "string") {
    return [element];
  }
  if (typeof element === "number") {
    return [element];
  }
  if (isUserValue(element)) {
    return [element];
  }
  if (isLinkValue(element)) {
    return [element];
  }
  return undefined;
}

function asArray(value: DatabaseCellValue | undefined): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isUserValue(value: unknown): value is DatabaseUserValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    !("mimetype" in value)
  );
}

function isLinkValue(value: unknown): value is DatabaseLinkValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    !("mimetype" in value)
  );
}

function compareRanks(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function groupComparator(field: DatabaseField) {
  const choices = field.options.choices;
  if (choices?.length && !field.isLookup) {
    const rank = new Map(choices.map((choice, index) => [choice.name, index]));
    return (a: RecordGroup, b: RecordGroup) =>
      (rank.get(a.key) ?? choices.length) -
        (rank.get(b.key) ?? choices.length) || a.label.localeCompare(b.label);
  }
  if (field.cellValueType === "number" || field.cellValueType === "boolean") {
    return (a: RecordGroup, b: RecordGroup) =>
      Number(a.label) - Number(b.label);
  }
  return (a: RecordGroup, b: RecordGroup) =>
    a.label.localeCompare(b.label, undefined, { numeric: true });
}

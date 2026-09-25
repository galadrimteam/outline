import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilter,
  DatabaseFilterValue,
  DatabaseLinkValue,
  DatabaseRecord,
  DatabaseStatusGroup,
  DatabaseUserValue,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { isDateFilterValue, isFilterGroup } from "@shared/databases/filters";
import type { DatabaseSchemaIndex } from "./databaseInputs";
import { describeOperator, isWritableField, snakeCase } from "./databaseInputs";

export interface PresentedPerson {
  name: string;
  email?: string;
}

export interface PresentedLink {
  id: string;
  title?: string;
}

export interface PresentedFile {
  name: string;
  url?: string;
}

type PresentedItem =
  | string
  | number
  | boolean
  | PresentedPerson
  | PresentedLink
  | PresentedFile;

/** A cell as MCP clients read it: names instead of engine objects. */
export type PresentedValue = PresentedItem | PresentedItem[];

/** A row as MCP clients read it. */
export interface PresentedDatabaseRecord {
  id: string;
  /** The row's page in Outline, created when first opened. */
  url: string;
  /** The Outline document of the row, once its page has been opened. */
  pageId?: string;
  /** Values keyed by property name; empty properties are left out. */
  properties: Record<string, PresentedValue>;
  createdTime?: string;
  lastModifiedTime?: string;
}

/** A property as MCP clients read it in a schema. */
export interface PresentedProperty {
  name: string;
  type: DatabaseFieldType;
  primary?: boolean;
  readOnly?: boolean;
  multiple?: boolean;
  description?: string;
  options?: string[];
  statusGroups?: Partial<Record<DatabaseStatusGroup, string[]>>;
  linkedDatabaseId?: string;
  dateRangeEnd?: string;
}

/** A view as MCP clients read it. */
export interface PresentedView {
  id: string;
  name: string;
  layout: string;
  /** The property a board is split into columns by, or a view grouped by. */
  groupedBy?: string;
  filter?: string;
  sort?: { property: string; direction: string }[];
}

/**
 * Presents a row with its values keyed by property names.
 *
 * @param index the schema of the database.
 * @param record the row, as presented by the API (with its page id).
 * @param databaseUrl the absolute URL of the database.
 * @returns the row.
 */
export function presentRecord(
  index: DatabaseSchemaIndex,
  record: DatabaseRecord,
  databaseUrl: string
): PresentedDatabaseRecord {
  const properties: Record<string, PresentedValue> = {};
  for (const field of index.fields) {
    const value = presentValue(field, record.fields[field.id]);
    if (value !== undefined) {
      properties[field.name] = value;
    }
  }
  return {
    id: record.id,
    url: `${databaseUrl}/row/${record.id}`,
    ...(record.documentId ? { pageId: record.documentId } : {}),
    properties,
    ...(record.createdTime ? { createdTime: record.createdTime } : {}),
    ...(record.lastModifiedTime
      ? { lastModifiedTime: record.lastModifiedTime }
      : {}),
  };
}

/**
 * Presents a cell: option names, people's names and e-mails, linked rows'
 * titles and files' names instead of engine objects.
 *
 * @param field the property.
 * @param value the cell value.
 * @returns the value, or undefined when the cell is empty.
 */
export function presentValue(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): PresentedValue | undefined {
  if (field.type === DatabaseFieldType.Checkbox) {
    return value === true;
  }
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return presentItem(field, value);
  }
  const items = [...value].map((item) => presentItem(field, item));
  return items.length ? items : undefined;
}

/**
 * Presents a property of a schema, with the names of its options.
 *
 * @param index the schema of the database.
 * @param field the property.
 * @returns the property.
 */
export function presentProperty(
  index: DatabaseSchemaIndex,
  field: DatabaseField
): PresentedProperty {
  const choices = field.options.choices?.map((choice) => choice.name);
  const statusGroups = field.meta?.statusGroups;
  const endField = field.meta?.endFieldId
    ? index.fieldById(field.meta.endFieldId)
    : undefined;
  return {
    name: field.name,
    type: field.type,
    ...(field.isPrimary ? { primary: true } : {}),
    ...(isWritableField(field) ? {} : { readOnly: true }),
    ...(field.isMultipleCellValue ? { multiple: true } : {}),
    ...(field.description ? { description: field.description } : {}),
    ...(choices?.length ? { options: choices } : {}),
    ...(statusGroups
      ? { statusGroups: groupChoices(choices ?? [], statusGroups) }
      : {}),
    ...(field.options.foreignDatabaseId
      ? { linkedDatabaseId: field.options.foreignDatabaseId }
      : {}),
    ...(endField ? { dateRangeEnd: endField.name } : {}),
  };
}

/**
 * Presents a view with its filter and sort written with property names.
 *
 * @param index the schema of the database.
 * @param view the view, with Outline's overrides applied.
 * @returns the view.
 */
export function presentView(
  index: DatabaseSchemaIndex,
  view: DatabaseView
): PresentedView {
  const groupedBy = index.groupingField(view)?.name;
  const filter = describeFilter(index, view.filter);
  const sort = view.sort?.sortObjs.map((item) => ({
    property: index.fieldById(item.fieldId)?.name ?? item.fieldId,
    direction: item.order,
  }));
  return {
    id: view.id,
    name: view.name,
    layout: view.layout,
    ...(groupedBy ? { groupedBy } : {}),
    ...(filter ? { filter } : {}),
    ...(sort?.length ? { sort } : {}),
  };
}

/**
 * Writes a filter as a sentence with property names, for example
 * `Status is "To test" and (Assignee is Me or Assignee is empty)`.
 *
 * @param index the schema of the database.
 * @param filter the filter.
 * @returns the sentence, or undefined without a filter.
 */
export function describeFilter(
  index: DatabaseSchemaIndex,
  filter: DatabaseFilter | null | undefined
): string | undefined {
  if (!filter?.filterSet.length) {
    return undefined;
  }
  return filter.filterSet
    .map((node) => {
      if (isFilterGroup(node)) {
        const group = describeFilter(index, node);
        return group ? `(${group})` : "";
      }
      const name = index.fieldById(node.fieldId)?.name ?? node.fieldId;
      const value = describeFilterValue(node.value);
      return [name, describeOperator(node.operator), value]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join(` ${filter.conjunction} `);
}

function presentItem(
  field: DatabaseField,
  item:
    | string
    | number
    | boolean
    | DatabaseUserValue
    | DatabaseLinkValue
    | DatabaseAttachmentValue
): PresentedItem {
  if (typeof item !== "object") {
    return item;
  }
  if ("mimetype" in item) {
    return { name: item.name, ...(item.url ? { url: item.url } : {}) };
  }
  if (isPersonField(field) || "email" in item) {
    return {
      name: item.title ?? "",
      ...("email" in item && item.email ? { email: item.email } : {}),
    };
  }
  return { id: item.id, ...(item.title ? { title: item.title } : {}) };
}

function isPersonField(field: DatabaseField): boolean {
  return (
    field.type === DatabaseFieldType.User ||
    field.type === DatabaseFieldType.CreatedBy ||
    field.type === DatabaseFieldType.LastModifiedBy
  );
}

/** Lists the options of each status group in the order of the select. */
function groupChoices(
  choices: string[],
  statusGroups: Record<string, DatabaseStatusGroup>
): Partial<Record<DatabaseStatusGroup, string[]>> {
  const names = [
    ...choices,
    ...Object.keys(statusGroups).filter((name) => !choices.includes(name)),
  ];
  const groups: Partial<Record<DatabaseStatusGroup, string[]>> = {};
  for (const name of names) {
    const group = statusGroups[name];
    if (group) {
      groups[group] = [...(groups[group] ?? []), name];
    }
  }
  return groups;
}

function describeFilterValue(value: DatabaseFilterValue): string {
  if (value === null) {
    return "";
  }
  if (isDateFilterValue(value)) {
    if (value.exactDate) {
      return value.exactDate.slice(0, 10);
    }
    if (value.numberOfDays !== undefined) {
      return `${snakeCase(value.mode)} ${value.numberOfDays}`;
    }
    return snakeCase(value.mode);
  }
  return typeof value === "string" || Array.isArray(value)
    ? JSON.stringify(value)
    : String(value);
}

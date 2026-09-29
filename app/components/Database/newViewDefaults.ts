import type {
  DatabaseColumnMeta,
  DatabaseField,
  DatabaseViewOptions,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { isStackable } from "./boardModel";

/** What a new view is created with besides its name and layout. */
export interface NewViewSettings {
  options?: Partial<DatabaseViewOptions>;
  overrides?: Partial<DatabaseViewOverrides>;
  /** Saved once the view exists: `databaseViews.create` takes no columns. */
  columnMeta?: Record<string, Partial<DatabaseColumnMeta>>;
}

/** How many properties a new list shows next to the title. */
export const LIST_PROPERTY_COUNT = 3;

/**
 * Returns the settings a new view starts with, like Notion: a board grouped
 * by the status, a calendar and a timeline on the first date property and
 * the end of its range, a list with the title and a few short properties.
 *
 * @param layout the layout of the new view.
 * @param fields the database's fields, in order.
 * @returns the options and overrides to create the view with.
 */
export function newViewSettings(
  layout: DatabaseLayout,
  fields: DatabaseField[]
): NewViewSettings {
  switch (layout) {
    case DatabaseLayout.Board: {
      const field = boardGroupField(fields);
      return field ? { options: { stackFieldId: field.id } } : {};
    }
    case DatabaseLayout.Calendar: {
      const start = defaultDateField(fields);
      if (!start) {
        return {};
      }
      // Both engines read an end equal to the start as single-day rows, while
      // a missing end makes them pick another date property.
      const end = rangeEndField(fields, start) ?? start;
      return {
        options: { startDateFieldId: start.id, endDateFieldId: end.id },
      };
    }
    case DatabaseLayout.Timeline: {
      const start = defaultDateField(fields);
      if (!start) {
        return {};
      }
      const end = rangeEndField(fields, start);
      return {
        overrides: {
          timeline: end
            ? { startFieldId: start.id, endFieldId: end.id }
            : { startFieldId: start.id },
        },
      };
    }
    case DatabaseLayout.List: {
      const shown = new Set(
        fields
          .filter((field) => !field.isPrimary && isShortField(field))
          .slice(0, LIST_PROPERTY_COUNT)
          .map((field) => field.id)
      );
      const hidden = fields.filter(
        (field) => !field.isPrimary && !shown.has(field.id)
      );
      return hidden.length
        ? {
            columnMeta: Object.fromEntries(
              hidden.map((field) => [field.id, { hidden: true }])
            ),
          }
        : {};
    }
    default:
      return {};
  }
}

/**
 * Returns the property a new board is grouped by: a single select with
 * status groups, else one named like a status, else the first single select.
 *
 * @param fields the database's fields, in order.
 * @returns the field, or undefined when there is no single select.
 */
export function boardGroupField(
  fields: DatabaseField[]
): DatabaseField | undefined {
  const selects = fields.filter(isStackable);
  return (
    selects.find(
      (field) => Object.keys(field.meta?.statusGroups ?? {}).length > 0
    ) ??
    selects.find((field) => isStatusName(field.name)) ??
    selects[0]
  );
}

/**
 * Returns the date property a calendar or a timeline shows by default: the
 * first date property, else the first single date value (a created time, a
 * formula…).
 *
 * @param fields the database's fields, in order.
 * @returns the field, or undefined when there is no date.
 */
export function defaultDateField(
  fields: DatabaseField[]
): DatabaseField | undefined {
  const dates = fields.filter(
    (field) => field.cellValueType === "dateTime" && !field.isMultipleCellValue
  );
  return (
    dates.find(
      (field) => field.type === DatabaseFieldType.Date && !field.isComputed
    ) ?? dates[0]
  );
}

/**
 * Returns the property holding the end of a date range whose start is given.
 *
 * @param fields the database's fields.
 * @param start the start property.
 * @returns the end property, or undefined for single dates.
 */
export function rangeEndField(
  fields: DatabaseField[],
  start: DatabaseField
): DatabaseField | undefined {
  const id = start.meta?.endFieldId;
  return id && id !== start.id
    ? fields.find((field) => field.id === id)
    : undefined;
}

const SHORT_FIELD_TYPES = new Set<DatabaseFieldType>([
  DatabaseFieldType.SingleSelect,
  DatabaseFieldType.MultipleSelect,
  DatabaseFieldType.User,
  DatabaseFieldType.Date,
  DatabaseFieldType.Checkbox,
  DatabaseFieldType.Number,
  DatabaseFieldType.Rating,
]);

function isShortField(field: DatabaseField): boolean {
  return !field.isLookup && SHORT_FIELD_TYPES.has(field.type);
}

const STATUS_WORDS = new Set(["statut", "status", "etat", "state"]);

function isStatusName(name: string): boolean {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => STATUS_WORDS.has(word));
}

import type {
  DatabaseField,
  DatabaseFieldFormatting,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { safeTimeZone } from "./time/zone";

/** The properties of a field the query layer reads; engine rows and neutral fields both have them. */
export type QueryField = Pick<
  DatabaseField,
  | "id"
  | "name"
  | "type"
  | "options"
  | "lookupOptions"
  | "isComputed"
  | "isLookup"
  | "cellValueType"
  | "isMultipleCellValue"
>;

const COMPUTED_TYPES: DatabaseFieldType[] = [
  DatabaseFieldType.Formula,
  DatabaseFieldType.Rollup,
  DatabaseFieldType.ConditionalRollup,
  DatabaseFieldType.AutoNumber,
  DatabaseFieldType.CreatedTime,
  DatabaseFieldType.LastModifiedTime,
  DatabaseFieldType.CreatedBy,
  DatabaseFieldType.LastModifiedBy,
  DatabaseFieldType.Button,
];

/**
 * Whether a field holds people.
 *
 * @param type the field type.
 * @returns true for person, created by and last modified by fields.
 */
export function isUserType(type: DatabaseFieldType): boolean {
  return (
    type === DatabaseFieldType.User ||
    type === DatabaseFieldType.CreatedBy ||
    type === DatabaseFieldType.LastModifiedBy
  );
}

/**
 * Whether a field holds objects with an id and a title (people, linked rows).
 *
 * @param type the field type.
 * @returns true for people and links.
 */
export function isUserOrLinkType(type: DatabaseFieldType): boolean {
  return isUserType(type) || type === DatabaseFieldType.Link;
}

/**
 * Whether a field's cells are computed rather than written.
 *
 * @param field the field.
 * @returns true for formulas, rollups, lookups and system fields.
 */
export function isComputedField(
  field: Pick<QueryField, "type" | "isComputed" | "isLookup">
): boolean {
  return (
    field.isComputed || field.isLookup || COMPUTED_TYPES.includes(field.type)
  );
}

/**
 * Returns the display formatting of a field's dates or numbers.
 *
 * @param field the field.
 * @returns the formatting, empty when the field has none.
 */
export function formattingOf(
  field: Pick<QueryField, "options">
): DatabaseFieldFormatting {
  return field.options?.formatting ?? {};
}

/**
 * Returns the zone a field's dates are shown and compared in.
 *
 * @param field the field.
 * @param fallback the zone to use when the field names none.
 * @returns a valid IANA time zone.
 */
export function fieldTimeZone(
  field: Pick<QueryField, "options">,
  fallback?: string
): string {
  return safeTimeZone(
    field.options?.formatting?.timeZone ?? field.options?.timeZone ?? fallback
  );
}

/**
 * Whether a date field shows a time of day.
 *
 * @param field the field.
 * @returns true when its formatting has a time.
 */
export function showsTime(field: Pick<QueryField, "options">): boolean {
  const time = field.options?.formatting?.time;
  return !!time && time !== "None";
}

/**
 * Indexes fields by id.
 *
 * @param fields the fields.
 * @returns the map.
 */
export function fieldsById<T extends { id: string }>(
  fields: T[]
): Map<string, T> {
  return new Map(fields.map((field) => [field.id, field]));
}

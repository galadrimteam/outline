import { isEqual } from "es-toolkit/compat";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";

/**
 * Returns the text of each item of a cell: choice names, text, numbers,
 * "true" or "false", the titles of people and linked rows.
 *
 * @param value the cell value.
 * @returns the texts, one per item.
 */
export function cellTokens(value: DatabaseCellValue | undefined): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (typeof item === "string") {
      return item ? [item] : [];
    }
    if (typeof item === "number" || typeof item === "boolean") {
      return [String(item)];
    }
    if (
      typeof item === "object" &&
      item !== null &&
      "title" in item &&
      typeof item.title === "string"
    ) {
      return [item.title];
    }
    return [];
  });
}

/**
 * Returns how each person or linked row of a cell can be designated: its id,
 * and the email of a person, to compare them with filter values.
 *
 * @param value the cell value.
 * @returns the keys of each item.
 */
export function cellReferences(
  value: DatabaseCellValue | undefined
): string[][] {
  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string"
    ) {
      return [];
    }
    const keys = [item.id];
    if ("email" in item && typeof item.email === "string") {
      keys.push(item.email.toLowerCase());
    }
    return [keys];
  });
}

/**
 * Returns the Outline users of a person cell, as filled by the user mapper.
 *
 * @param value the cell value.
 * @returns the Outline user ids.
 */
export function cellOutlineUserIds(
  value: DatabaseCellValue | undefined
): string[] {
  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    isUserValue(item) && item.outlineUserId ? [item.outlineUserId] : []
  );
}

/**
 * Tells whether a cell holds nothing.
 *
 * @param value the cell value.
 * @returns true for null, "", [] and false.
 */
export function isEmptyCell(value: DatabaseCellValue | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Tells whether two cell values are the same.
 *
 * @param a a value.
 * @param b another value.
 * @returns true when equal, empties being equal to each other.
 */
export function sameCell(
  a: DatabaseCellValue | undefined,
  b: DatabaseCellValue | undefined
): boolean {
  if (isEmptyCell(a) && isEmptyCell(b)) {
    return true;
  }
  return isEqual(a, b);
}

/**
 * Tells whether a field holds people.
 *
 * @param field the field.
 * @returns true for person, created by and modified by fields.
 */
export function isPersonField(field: Pick<DatabaseField, "type">): boolean {
  return (
    field.type === DatabaseFieldType.User ||
    field.type === DatabaseFieldType.CreatedBy ||
    field.type === DatabaseFieldType.LastModifiedBy
  );
}

/**
 * Tells whether a field holds dates.
 *
 * @param field the field.
 * @returns true for date fields and date-valued computed fields.
 */
export function isDateField(
  field: Pick<DatabaseField, "type" | "cellValueType">
): boolean {
  return (
    field.type === DatabaseFieldType.Date ||
    field.type === DatabaseFieldType.CreatedTime ||
    field.type === DatabaseFieldType.LastModifiedTime ||
    field.cellValueType === "dateTime"
  );
}

/**
 * Tells whether a field can be written: not computed by the engine.
 *
 * @param field the field.
 * @returns true when a value can be written to it.
 */
export function isWritableField(
  field: Pick<DatabaseField, "type" | "isComputed" | "isLookup">
): boolean {
  return (
    !field.isComputed &&
    !field.isLookup &&
    ![
      DatabaseFieldType.Formula,
      DatabaseFieldType.Rollup,
      DatabaseFieldType.ConditionalRollup,
      DatabaseFieldType.AutoNumber,
      DatabaseFieldType.CreatedTime,
      DatabaseFieldType.LastModifiedTime,
      DatabaseFieldType.CreatedBy,
      DatabaseFieldType.LastModifiedBy,
      DatabaseFieldType.Button,
    ].includes(field.type)
  );
}

/**
 * Tells whether a field takes several values.
 *
 * @param field the field.
 * @returns true for multiple selects, links to many and multiple people.
 */
export function isMultipleField(
  field: Pick<DatabaseField, "isMultipleCellValue" | "options">
): boolean {
  return field.isMultipleCellValue || !!field.options.isMultiple;
}

function isUserValue(item: unknown): item is DatabaseUserValue {
  return (
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    "title" in item &&
    "email" in item
  );
}

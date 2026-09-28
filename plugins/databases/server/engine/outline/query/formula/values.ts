import type {
  DatabaseCellValue,
  DatabaseCellValueType,
} from "@shared/databases/types";
import type { CellItem } from "../cellValues";
import {
  cellFromItems,
  cellItems,
  isObjectItem,
  itemTitle,
} from "../cellValues";
import type { QueryField } from "../fields";
import { formatDateOfField } from "../text";
import { parseInstant } from "../time/parse";

/** The type of a formula value: what it holds, and whether it is a list. */
export interface ValueType {
  type: DatabaseCellValueType;
  isMultiple: boolean;
}

/** One value inside a formula; a date is held as UTC milliseconds. */
export type Scalar = string | number | boolean | null;

/** A formula value: a scalar, or a list of scalars for a list type. */
export type Value = Scalar | Scalar[];

/** One text. */
export const TEXT: ValueType = { type: "string", isMultiple: false };
/** One number. */
export const NUMBER: ValueType = { type: "number", isMultiple: false };
/** One boolean. */
export const BOOLEAN: ValueType = { type: "boolean", isMultiple: false };
/** One date, held as UTC milliseconds. */
export const DATE: ValueType = { type: "dateTime", isMultiple: false };

/** A failure while computing a cell: the cell gets no value. */
export class FormulaRuntimeError extends Error {}

/**
 * Whether two value types are the same.
 *
 * @param a a type.
 * @param b another type.
 * @returns true when equal.
 */
export function sameType(a: ValueType, b: ValueType): boolean {
  return a.type === b.type && a.isMultiple === b.isMultiple;
}

/**
 * Whether a value counts as true, as Teable reads a condition: empty text,
 * zero, false, an empty list and nothing are false.
 *
 * @param value the value.
 * @param type its type.
 * @returns the truth of the value.
 */
export function isTruthy(value: Value, type: ValueType): boolean {
  if (value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  switch (type.type) {
    case "dateTime":
      return true;
    case "number":
      return typeof value === "number"
        ? value !== 0 && !Number.isNaN(value)
        : !!value;
    case "boolean":
      return value === true || value === "true";
    default:
      return value !== "" && value !== false;
  }
}

/**
 * Whether a value holds nothing: no value, empty text or an empty list.
 *
 * @param value the value.
 * @returns true when empty.
 */
export function isEmptyValue(value: Value): boolean {
  if (Array.isArray(value)) {
    return value.every((item) => item === null || item === "");
  }
  return value === null || value === "";
}

/**
 * Reads a number from text the lenient way Teable does: everything but
 * digits, signs and dots is dropped ("12 €" is 12), and what is left must be
 * a plain decimal.
 *
 * @param text the text.
 * @returns the number, or null.
 */
export function looseNumber(text: string): number | null {
  const cleaned = text.replace(/[^0-9.+-]/g, "");
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) {
    return null;
  }
  return Number(cleaned);
}

/**
 * Converts a scalar to a number.
 *
 * @param value the scalar.
 * @param type its type.
 * @returns the number, or null (dates have none).
 */
export function toNumber(
  value: Scalar,
  type: DatabaseCellValueType
): number | null {
  if (value === null) {
    return null;
  }
  switch (type) {
    case "dateTime":
      return null;
    case "boolean":
      return value === true || value === "true" ? 1 : 0;
    default:
      if (typeof value === "number") {
        return Number.isNaN(value) ? null : value;
      }
      if (typeof value === "boolean") {
        return value ? 1 : 0;
      }
      return looseNumber(value);
  }
}

/**
 * Converts a scalar to text: numbers as written, booleans as "true" or
 * "false", dates as the field they come from shows them, else ISO 8601.
 *
 * @param value the scalar.
 * @param type its type.
 * @param field the field the value was read from, for its date format.
 * @returns the text, or null.
 */
export function toText(
  value: Scalar,
  type: DatabaseCellValueType,
  field?: Pick<QueryField, "options">
): string | null {
  if (value === null) {
    return null;
  }
  if (type === "dateTime" && typeof value === "number") {
    return field
      ? formatDateOfField(value, field)
      : new Date(value).toISOString();
  }
  return String(value);
}

/**
 * Converts a scalar to a date.
 *
 * @param value the scalar.
 * @param type its type.
 * @param timeZone the zone of a text date written without one.
 * @returns the instant, or null.
 */
export function toDate(
  value: Scalar,
  type: DatabaseCellValueType,
  timeZone: string
): number | null {
  if (value === null) {
    return null;
  }
  if (type === "dateTime") {
    return typeof value === "number" && !Number.isNaN(value) ? value : null;
  }
  return typeof value === "string" ? parseInstant(value, timeZone) : null;
}

/**
 * Converts a scalar from one type to another.
 *
 * @param value the scalar.
 * @param from its type.
 * @param to the wanted type.
 * @param timeZone the zone of text dates.
 * @param field the field the value was read from.
 * @returns the converted scalar.
 */
export function convertScalar(
  value: Scalar,
  from: DatabaseCellValueType,
  to: DatabaseCellValueType,
  timeZone: string,
  field?: Pick<QueryField, "options">
): Scalar {
  if (value === null || from === to) {
    return value;
  }
  switch (to) {
    case "number":
      return toNumber(value, from);
    case "string":
      return toText(value, from, field);
    case "dateTime":
      return toDate(value, from, timeZone);
    case "boolean":
      return isTruthy(value, { type: from, isMultiple: false });
  }
}

/**
 * Reduces a list to one scalar for an operator or a function taking one
 * value: nothing for an empty list, its element for a list of one, the texts
 * joined by ", " for text.
 *
 * @param value the value.
 * @param type its type.
 * @param field the field the value was read from.
 * @returns the scalar.
 * @throws FormulaRuntimeError when a list of several numbers, dates or booleans cannot be reduced.
 */
export function toScalar(
  value: Value,
  type: ValueType,
  field?: Pick<QueryField, "options">
): Scalar {
  if (!Array.isArray(value)) {
    return value;
  }
  const items = value.filter((item) => item !== null);
  if (!items.length) {
    return null;
  }
  if (items.length === 1) {
    return items[0];
  }
  if (type.type === "string") {
    return items.join(", ");
  }
  if (type.type === "dateTime" && field) {
    return items.map((item) => toText(item, "dateTime", field)).join(", ");
  }
  throw new FormulaRuntimeError("A list of several values cannot be used here");
}

/**
 * Converts a value between types, lists included: a list becomes one value
 * (see `toScalar`, texts joined), one value becomes a list of one.
 *
 * @param value the value.
 * @param from its type.
 * @param to the wanted type.
 * @param timeZone the zone of text dates.
 * @param field the field the value was read from.
 * @returns the converted value.
 */
export function convertValue(
  value: Value,
  from: ValueType,
  to: ValueType,
  timeZone: string,
  field?: Pick<QueryField, "options">
): Value {
  if (sameType(from, to) || value === null) {
    return value;
  }
  const one = (item: Scalar) =>
    convertScalar(item, from.type, to.type, timeZone, field);
  if (to.isMultiple) {
    const items = Array.isArray(value) ? value : [value];
    return items.map(one);
  }
  if (Array.isArray(value)) {
    if (to.type === "string") {
      const texts = value
        .map((item) => toText(item, from.type, field))
        .filter((item): item is string => item !== null && item !== "");
      return texts.length ? texts.join(", ") : null;
    }
    return one(toScalar(value, from, field));
  }
  return one(value);
}

/**
 * Reads a cell as a formula value of the field's type: people and linked
 * rows by title, attachments by name, dates as instants.
 *
 * @param value the cell value.
 * @param field the field of the cell.
 * @returns the formula value.
 */
export function valueOfCell(
  value: DatabaseCellValue | undefined,
  field: Pick<QueryField, "cellValueType" | "isMultipleCellValue">
): Value {
  const items = cellItems(value);
  const read = (item: CellItem) => scalarOfItem(item, field.cellValueType);
  if (field.isMultipleCellValue) {
    return items.length ? items.map(read) : null;
  }
  return items.length ? read(items[0]) : null;
}

/**
 * Writes a formula value as a cell value: instants as ISO 8601, no empty
 * text, no empty list, no number that is not finite.
 *
 * @param value the formula value.
 * @param type its type.
 * @returns the cell value.
 */
export function cellOfValue(value: Value, type: ValueType): DatabaseCellValue {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => cellScalar(item, type.type))
      .filter((item): item is string | number | boolean => item !== null);
    return cellFromItems(items);
  }
  return cellScalar(value, type.type);
}

function cellScalar(
  value: Scalar,
  type: DatabaseCellValueType
): string | number | boolean | null {
  if (value === null) {
    return null;
  }
  switch (type) {
    case "dateTime":
      return typeof value === "number" && Number.isFinite(value)
        ? new Date(value).toISOString()
        : null;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    case "boolean":
      return value === true || value === "true";
    default:
      return value === "" ? null : String(value);
  }
}

function scalarOfItem(item: CellItem, type: DatabaseCellValueType): Scalar {
  if (isObjectItem(item)) {
    return itemTitle(item);
  }
  switch (type) {
    case "dateTime": {
      if (typeof item === "number") {
        return item;
      }
      const ms = Date.parse(String(item));
      return Number.isNaN(ms) ? null : ms;
    }
    case "number":
      return typeof item === "number" ? item : looseNumber(String(item));
    case "boolean":
      return item === true || item === "true";
    default:
      return typeof item === "string" ? item : String(item);
  }
}

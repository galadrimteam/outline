import type {
  DatabaseCellValue,
  DatabaseFieldFormatting,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { CellItem } from "./cellValues";
import { cellItems, isObjectItem, itemTitle } from "./cellValues";
import type { QueryField } from "./fields";
import { fieldTimeZone, formattingOf } from "./fields";
import { formatInstant } from "./time/format";

const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
const NON_ASCII = /[\u0080-\uffff]/;

/**
 * Returns the text a cell shows, as Teable writes it: numbers with the
 * field's precision, percent or currency, dates in the field's format and
 * zone, people and linked rows by title, attachments by name, several values
 * separated by ", ".
 *
 * @param value the cell value.
 * @param field the field of the cell.
 * @returns the text, "" for an empty cell.
 */
export function cellText(
  value: DatabaseCellValue | undefined,
  field: Pick<QueryField, "type" | "options" | "cellValueType">
): string {
  const items = cellItems(value);
  if (!items.length) {
    return "";
  }
  return items.map((item) => cellItemText(item, field)).join(", ");
}

/**
 * Formats a number the way a field shows it.
 *
 * @param value the number.
 * @param formatting the field's formatting.
 * @returns the text.
 */
export function formatNumber(
  value: number,
  formatting: DatabaseFieldFormatting = {}
): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const precision =
    formatting.precision === undefined
      ? undefined
      : Math.min(Math.max(Math.trunc(formatting.precision), 0), 20);
  if (formatting.type === "currency") {
    const text = Math.abs(value).toLocaleString(
      "en-US",
      precision !== undefined
        ? { minimumFractionDigits: precision, maximumFractionDigits: precision }
        : undefined
    );
    return `${value < 0 ? "-" : ""}${formatting.symbol ?? "$"}${text}`;
  }
  if (formatting.type === "percent") {
    return `${(value * 100).toFixed(precision ?? 0)}%`;
  }
  return precision !== undefined ? value.toFixed(precision) : String(value);
}

/**
 * Formats an instant the way a date field shows it: its date format, its
 * time format unless "None", in its zone.
 *
 * @param ms the instant.
 * @param field the field.
 * @param fallbackTimeZone the zone when the field names none.
 * @returns the text.
 */
export function formatDateOfField(
  ms: number,
  field: Pick<QueryField, "options">,
  fallbackTimeZone?: string
): string {
  const { date, time } = formattingOf(field);
  const format =
    time && time !== "None"
      ? `${date || DEFAULT_DATE_FORMAT} ${time}`
      : date || DEFAULT_DATE_FORMAT;
  return formatInstant(ms, format, fieldTimeZone(field, fallbackTimeZone));
}

/**
 * Folds a text for searching: lower case, without accents.
 *
 * @param text the text.
 * @returns the folded text.
 */
export function searchKey(text: string): string {
  const lower = text.toLowerCase();
  return NON_ASCII.test(lower)
    ? lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : lower;
}

/**
 * Returns the text of one element of a cell, as `cellText` writes it.
 *
 * @param item the element.
 * @param field the field of the cell.
 * @returns the text.
 */
export function cellItemText(
  item: CellItem,
  field: Pick<QueryField, "type" | "options" | "cellValueType">
): string {
  if (isObjectItem(item)) {
    return itemTitle(item);
  }
  switch (field.cellValueType) {
    case "number":
      return typeof item === "number"
        ? formatNumber(item, formattingOf(field))
        : String(item);
    case "dateTime": {
      const ms = typeof item === "string" ? Date.parse(item) : NaN;
      return Number.isNaN(ms) ? String(item) : formatDateOfField(ms, field);
    }
    case "boolean":
      if (field.type === DatabaseFieldType.Checkbox) {
        return item === true || item === "true" ? "true" : "";
      }
      return String(item);
    default: {
      const text = String(item);
      return field.type === DatabaseFieldType.MultipleSelect &&
        text.includes(",")
        ? `"${text}"`
        : text;
    }
  }
}

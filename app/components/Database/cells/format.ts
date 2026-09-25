import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseField,
  DatabaseFieldFormatting,
  DatabaseLinkValue,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";

/** The wall-clock parts of an instant in a time zone. */
export interface DateParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** One element of a multiple cell value. */
export type CellItem =
  | string
  | number
  | boolean
  | null
  | DatabaseUserValue
  | DatabaseLinkValue
  | DatabaseAttachmentValue;

/**
 * Normalises a cell value to a list: `null` and `undefined` give an empty list, a single value
 * a list of one.
 *
 * @param value the cell value.
 * @returns the elements of the value.
 */
export function toArray(value: DatabaseCellValue | undefined): CellItem[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value];
}

/**
 * Whether a cell counts as empty (Notion's "Hide when empty"): nothing, blank text, an empty list
 * or an unchecked checkbox.
 *
 * @param value the cell value.
 * @returns true when the cell shows nothing.
 */
export function isEmptyCellValue(
  value: DatabaseCellValue | undefined
): boolean {
  if (value === null || value === undefined || value === false) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/**
 * Whether a list element is an object (person, linked row or attachment).
 *
 * @param item a cell element.
 * @returns true for object elements.
 */
export function isObjectItem(
  item: CellItem
): item is DatabaseUserValue | DatabaseLinkValue | DatabaseAttachmentValue {
  return typeof item === "object" && item !== null;
}

/**
 * Whether a list element is a person.
 *
 * @param item a cell element.
 * @returns true for people.
 */
export function isUserItem(item: CellItem): item is DatabaseUserValue {
  return isObjectItem(item) && "title" in item && !("mimetype" in item);
}

/**
 * Whether a list element is a linked row.
 *
 * @param item a cell element.
 * @returns true for linked rows.
 */
export function isLinkItem(item: CellItem): item is DatabaseLinkValue {
  return isObjectItem(item) && !("mimetype" in item);
}

/**
 * Whether a list element is an attachment.
 *
 * @param item a cell element.
 * @returns true for attachments.
 */
export function isAttachmentItem(
  item: CellItem
): item is DatabaseAttachmentValue {
  return isObjectItem(item) && "mimetype" in item;
}

/**
 * Formats a number as the field asks: decimal, percent (the value is a ratio) or currency, with a
 * fixed precision when one is set.
 *
 * @param value the number.
 * @param formatting the field's number formatting.
 * @param locale the reader's locale.
 * @returns the text shown in the cell.
 */
export function formatNumber(
  value: number,
  formatting?: DatabaseFieldFormatting,
  locale?: string
): string {
  const precision = formatting?.precision;
  const digits =
    precision === undefined
      ? { maximumFractionDigits: 10 }
      : { minimumFractionDigits: precision, maximumFractionDigits: precision };

  if (formatting?.type === "percent") {
    return `${new Intl.NumberFormat(locale, digits).format(value * 100)} %`
      .replace(" %", isSymbolAfter(locale) ? " %" : "%")
      .trim();
  }

  const text = new Intl.NumberFormat(locale, digits).format(Math.abs(value));
  const sign = value < 0 ? "-" : "";

  if (formatting?.type === "currency") {
    const symbol = formatting.symbol ?? "€";
    return isSymbolAfter(locale)
      ? `${sign}${text} ${symbol}`
      : `${sign}${symbol}${text}`;
  }

  return `${sign}${text}`;
}

/**
 * Parses what a reader typed in a number cell, accepting a comma as decimal separator and spaces
 * as group separators. Percent fields take the percentage and store the ratio.
 *
 * @param input the typed text.
 * @param formatting the field's number formatting.
 * @returns the number, or null when the text is empty or not a number.
 */
export function parseNumberInput(
  input: string,
  formatting?: DatabaseFieldFormatting
): number | null {
  const cleaned = input
    .replace(/[\s  %]/g, "")
    .replace(formatting?.symbol ?? "€", "")
    .replace(/[^\d,.+-]/g, "");
  if (!cleaned) {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const groupSeparator = decimalSeparator === "," ? "." : ",";
  const normalized = cleaned
    .split(groupSeparator)
    .join("")
    .replace(decimalSeparator, ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return formatting?.type === "percent" ? parsed / 100 : parsed;
}

/**
 * The text a number editor starts with: the raw number, as a percentage for percent fields.
 *
 * @param value the stored number.
 * @param formatting the field's number formatting.
 * @returns the editable text.
 */
export function numberInputValue(
  value: DatabaseCellValue | undefined,
  formatting?: DatabaseFieldFormatting
): string {
  if (typeof value !== "number") {
    return "";
  }
  const shown = formatting?.type === "percent" ? value * 100 : value;
  return String(Number(shown.toPrecision(12)));
}

/**
 * Reads the wall-clock parts of an instant in a time zone.
 *
 * @param date the instant.
 * @param timeZone the IANA time zone, the browser's when absent.
 * @returns the parts.
 */
export function datePartsInZone(date: Date, timeZone?: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
  };
}

/**
 * The instant at which the clock of a time zone shows the given parts (the reverse of
 * `datePartsInZone`), as an ISO string.
 *
 * @param parts the wall-clock parts.
 * @param timeZone the IANA time zone, the browser's when absent.
 * @returns the ISO string of the instant.
 */
export function zonedPartsToISO(parts: DateParts, timeZone?: string): string {
  const wanted = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );
  let instant = wanted;
  // Two passes settle the offset, including on the day a daylight saving change happens.
  for (let pass = 0; pass < 2; pass++) {
    const seen = datePartsInZone(new Date(instant), timeZone);
    const seenUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute
    );
    instant += wanted - seenUtc;
  }
  return new Date(instant).toISOString();
}

/**
 * The calendar day (local midnight, as date pickers want it) of a stored date, read in the field's
 * time zone.
 *
 * @param iso the stored ISO date.
 * @param timeZone the field's time zone.
 * @returns the day, or undefined for an invalid date.
 */
export function isoToCalendarDay(
  iso: string,
  timeZone?: string
): Date | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const parts = datePartsInZone(date, timeZone);
  return new Date(parts.year, parts.month - 1, parts.day);
}

/**
 * The stored ISO date for a day picked in a calendar and a wall-clock time, in the field's time
 * zone.
 *
 * @param day the picked day (only its local year, month and day are read).
 * @param time the hours and minutes, midnight when absent.
 * @param timeZone the field's time zone.
 * @returns the ISO string.
 */
export function calendarDayToISO(
  day: Date,
  time: { hour: number; minute: number } | undefined,
  timeZone?: string
): string {
  return zonedPartsToISO(
    {
      year: day.getFullYear(),
      month: day.getMonth() + 1,
      day: day.getDate(),
      hour: time?.hour ?? 0,
      minute: time?.minute ?? 0,
    },
    timeZone
  );
}

/**
 * The time zone of a date field: its formatting's, else its own option, else the browser's.
 *
 * @param field the date field.
 * @returns the IANA time zone, or undefined for the browser's.
 */
export function fieldTimeZone(field: DatabaseField): string | undefined {
  return (
    field.options.formatting?.timeZone ?? field.options.timeZone ?? undefined
  );
}

/**
 * The date formatting of a field with its effective time zone.
 *
 * @param field the date field.
 * @returns the formatting to pass to `formatDateValue`.
 */
export function dateFormatting(field: DatabaseField): DatabaseFieldFormatting {
  return { ...field.options.formatting, timeZone: fieldTimeZone(field) };
}

/**
 * Whether a date field shows a time next to the date.
 *
 * @param formatting the field's date formatting.
 * @returns true when a time is shown.
 */
export function hasTime(formatting?: DatabaseFieldFormatting): boolean {
  return !!formatting?.time && formatting.time !== "None";
}

/**
 * Formats a date as the field asks. Long presets ("D MMMM YYYY", Notion's default) spell the month
 * in the reader's language: « 25 septembre 2026 ».
 *
 * @param iso the stored ISO date.
 * @param formatting the field's date formatting.
 * @param locale the reader's locale.
 * @returns the text shown in the cell, or "" for an invalid date.
 */
export function formatDateValue(
  iso: string,
  formatting?: DatabaseFieldFormatting,
  locale?: string
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = datePartsInZone(date, formatting?.timeZone);
  const pattern = formatting?.date ?? defaultDatePattern(locale);
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, parts.month - 1, 1)));
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = pattern.replace(/YYYY|MMMM|MM|M|DD|D/g, (token) => {
    switch (token) {
      case "YYYY":
        return String(parts.year);
      case "MMMM":
        return monthName;
      case "MM":
        return pad(parts.month);
      case "M":
        return String(parts.month);
      case "DD":
        return pad(parts.day);
      default:
        return String(parts.day);
    }
  });

  if (!hasTime(formatting)) {
    return text;
  }

  if (formatting?.time === "hh:mm A") {
    const hour = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
    const suffix = parts.hour < 12 ? "AM" : "PM";
    return `${text} ${pad(hour)}:${pad(parts.minute)} ${suffix}`;
  }
  return `${text} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * The URL a text shown as link opens: `mailto:` for e-mails, `tel:` for phones, and an http(s)
 * URL (https is added when missing) for URLs. Anything else gives no link.
 *
 * @param text the cell text.
 * @param showAs how the field shows its text.
 * @returns the href, or undefined when the text cannot be a safe link.
 */
export function hrefForText(
  text: string,
  showAs: string | undefined
): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  switch (showAs) {
    case "email":
      return /^[^\s@]+@[^\s@]+$/.test(trimmed)
        ? `mailto:${trimmed}`
        : undefined;
    case "phone": {
      const digits = trimmed.replace(/[^\d+]/g, "");
      return digits ? `tel:${digits}` : undefined;
    }
    case "url": {
      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }
      if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
        return undefined;
      }
      return `https://${trimmed}`;
    }
    default:
      return undefined;
  }
}

/**
 * Whether values of a field are dates (date fields, created/modified times, date formulas).
 *
 * @param field the field.
 * @returns true for date values.
 */
export function isDateField(field: DatabaseField): boolean {
  return (
    field.type === DatabaseFieldType.Date ||
    field.type === DatabaseFieldType.CreatedTime ||
    field.type === DatabaseFieldType.LastModifiedTime ||
    field.cellValueType === "dateTime"
  );
}

/**
 * Plain text of a cell, as shown in tooltips, statistics and read-only computed cells.
 *
 * @param field the field.
 * @param value the cell value.
 * @param locale the reader's locale.
 * @returns the text.
 */
export function cellValueToText(
  field: DatabaseField,
  value: DatabaseCellValue | undefined,
  locale?: string
): string {
  return toArray(value)
    .map((item) => itemToText(field, item, locale))
    .filter((text) => text !== "")
    .join(", ");
}

function itemToText(
  field: DatabaseField,
  item: CellItem,
  locale?: string
): string {
  if (item === null) {
    return "";
  }
  if (typeof item === "boolean") {
    return item ? "✓" : "";
  }
  if (typeof item === "number") {
    if (
      field.type === DatabaseFieldType.AutoNumber ||
      field.type === DatabaseFieldType.Rating
    ) {
      return String(item);
    }
    return formatNumber(item, field.options.formatting, locale);
  }
  if (typeof item === "string") {
    return isDateField(field)
      ? formatDateValue(item, dateFormatting(field), locale)
      : item;
  }
  if (isAttachmentItem(item)) {
    return item.name;
  }
  return item.title ?? "";
}

function defaultDatePattern(locale?: string): string {
  return locale?.toLowerCase().startsWith("en")
    ? "MMMM D, YYYY"
    : "D MMMM YYYY";
}

function isSymbolAfter(locale?: string): boolean {
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).formatToParts(1);
  const currency = parts.findIndex((part) => part.type === "currency");
  const integer = parts.findIndex((part) => part.type === "integer");
  return currency > integer;
}

function safeTimeZone(timeZone?: string): string | undefined {
  if (!timeZone) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

import type {
  DatabaseCellValue,
  DatabaseFieldFormatting,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { QueryField } from "./fields";
import { fieldTimeZone, formattingOf } from "./fields";
import { parseInstant } from "./time/parse";

/**
 * Reads the cell a text gives a field, as Teable converts text: trimmed text
 * on one line, numbers (a percent field or a "%" divides by 100), ratings
 * rounded and capped, checkboxes checked by any text but "false", dates in
 * the field's format and zone, select names that exist among the choices
 * (several separated by commas or new lines, quoted when they hold a comma).
 * People, links and attachments cannot be read from text: null.
 *
 * @param text the text.
 * @param field the field receiving it.
 * @returns the cell value, null when the text gives none.
 */
export function valueFromText(
  text: string,
  field: Pick<QueryField, "type" | "options" | "name">
): DatabaseCellValue {
  switch (field.type) {
    case DatabaseFieldType.SingleLineText:
      return oneLine(text) || null;
    case DatabaseFieldType.LongText:
      return text.trim() || null;
    case DatabaseFieldType.Number:
      return parseNumberText(text, formattingOf(field));
    case DatabaseFieldType.Rating: {
      const number = parseNumberText(text);
      return number === null ? null : clampRating(number, field.options.max);
    }
    case DatabaseFieldType.Checkbox:
      return checkedByText(text) ? true : null;
    case DatabaseFieldType.Date: {
      const { date, time } = formattingOf(field);
      const formats = date
        ? [time && time !== "None" ? `${date} ${time}` : date]
        : [];
      const ms = parseInstant(text, fieldTimeZone(field), formats);
      return ms === null ? null : new Date(ms).toISOString();
    }
    case DatabaseFieldType.SingleSelect: {
      const name = oneLine(text);
      return name && choiceExists(field, name) ? name : null;
    }
    case DatabaseFieldType.MultipleSelect: {
      const names = splitNames(text).filter((name) =>
        choiceExists(field, name)
      );
      return names.length ? names : null;
    }
    default:
      return null;
  }
}

/**
 * Reads a number the lenient way Teable does: every character but digits,
 * signs and dots is dropped, repeated signs collapse; a percent field, or a
 * "%" in the text, divides by 100.
 *
 * @param text the text.
 * @param formatting the number field's formatting.
 * @returns the number, or null when there is none.
 */
export function parseNumberText(
  text: string,
  formatting?: DatabaseFieldFormatting
): number | null {
  if (!text.trim()) {
    return null;
  }
  const cleaned = text.replace(/[^\d.+-]/g, "").replace(/([+\-.])+/g, "$1");
  const number = parseFloat(cleaned);
  if (Number.isNaN(number)) {
    return null;
  }
  return formatting?.type === "percent" || text.includes("%")
    ? number / 100
    : number;
}

/**
 * Splits select names written in one text: by commas and new lines, a name
 * holding a comma being written between double quotes.
 *
 * @param text the text.
 * @returns the names, trimmed, without blanks or repeats.
 */
export function splitNames(text: string): string[] {
  const names: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      names.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  names.push(current);
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

/**
 * Whether a select field has a choice of that name.
 *
 * @param field the select field.
 * @param name the name.
 * @returns true when the choice exists.
 */
export function choiceExists(
  field: Pick<QueryField, "options">,
  name: string
): boolean {
  return !!field.options.choices?.some((choice) => choice.name === name);
}

/**
 * Writes a text on one line: line breaks and tabs become spaces.
 *
 * @param text the text.
 * @returns the trimmed text.
 */
export function oneLine(text: string): string {
  return text.replace(/[\n\r\t]/g, " ").trim();
}

/**
 * Rounds a rating and caps it at the field's maximum.
 *
 * @param value the number.
 * @param max the field's maximum, 10 when unset.
 * @returns the rating, or null below 1.
 */
export function clampRating(
  value: number,
  max: number | undefined
): number | null {
  const rounded = Math.min(Math.round(value), max ?? 10);
  return rounded >= 1 ? rounded : null;
}

/**
 * Whether a text checks a checkbox: any text but blank, "false" or zero.
 *
 * @param text the text.
 * @returns true when checked.
 */
export function checkedByText(text: string): boolean {
  const value = text.trim().toLowerCase();
  return value !== "" && value !== "false" && Number(value) !== 0;
}

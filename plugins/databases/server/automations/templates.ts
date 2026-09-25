import type { DatabaseCellValue, DatabaseField } from "@shared/databases/types";
import { cellText } from "../utils/cellText";
import { isDateField } from "./cellValues";
import { dayIn } from "./dateRanges";

/** The values the variables of a message stand for. */
export interface TemplateVariables {
  title: string;
  url: string;
  database: string;
  actor: string;
  /** Returns the text of a property of the row, by name. */
  property: (name: string) => string | undefined;
}

const variablePattern = /\{\{\s*([A-Za-z]+)\s*(?::\s*([^}]*?)\s*)?\}\}/g;

/**
 * Replaces the variables of a message: {{title}}, {{url}}, {{database}},
 * {{actor}} and {{property:Name}}. Unknown variables are left as written, so
 * that a typo shows.
 *
 * @param text the message.
 * @param variables the values.
 * @returns the message with the values.
 */
export function renderTemplate(
  text: string,
  variables: TemplateVariables
): string {
  return text.replace(variablePattern, (match, name: string, arg?: string) => {
    switch (name.toLowerCase()) {
      case "title":
        return variables.title;
      case "url":
        return variables.url;
      case "database":
        return variables.database;
      case "actor":
        return variables.actor;
      case "property":
        return arg ? (variables.property(arg) ?? "") : match;
      default:
        return match;
    }
  });
}

/**
 * Returns the text of a cell for a message: dates as their day, other values
 * as their text.
 *
 * @param field the field of the cell.
 * @param value the cell value.
 * @returns the text.
 */
export function cellMessageText(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): string {
  if (isDateField(field) && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return dayIn(date, field.options.formatting?.timeZone ?? "UTC");
    }
  }
  return cellText(value);
}

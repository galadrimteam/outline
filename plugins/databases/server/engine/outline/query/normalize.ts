import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseField,
  DatabaseLinkValue,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { CellItem } from "./cellValues";
import {
  cellItems,
  isAttachmentItem,
  isObjectItem,
  itemId,
  itemTitle,
} from "./cellValues";
import { fieldTimeZone, formattingOf, isComputedField } from "./fields";
import {
  checkedByText,
  choiceExists,
  clampRating,
  oneLine,
  parseNumberText,
  splitNames,
} from "./textInput";
import { parseInstant } from "./time/parse";

/**
 * Checks and normalizes a value written to a cell: text trimmed (on one line
 * for a single line), numbers read from text, ratings rounded, checkboxes
 * true or null, dates to ISO 8601 (text read in the field's format and
 * zone), select names that must be choices, people as `{id, title}` (one or
 * a list, as the field takes), links as a list of `{id}` (one at most for a
 * single link), attachments kept. Blank values clear the cell.
 *
 * @param value the written value.
 * @param field the field written.
 * @returns the value to store.
 * @throws Error with a message fit for the user when the value cannot go in.
 */
export function normalizeInput(
  value: DatabaseCellValue,
  field: DatabaseField
): DatabaseCellValue {
  if (isComputedField(field)) {
    throw new Error(`« ${field.name} » is computed and cannot be written.`);
  }
  if (isBlank(value)) {
    return null;
  }
  const items = cellItems(value);
  if (!items.length) {
    return null;
  }
  switch (field.type) {
    case DatabaseFieldType.SingleLineText:
      return oneLine(texts(items).join(", ")) || null;
    case DatabaseFieldType.LongText:
      return texts(items).join(", ").trim() || null;
    case DatabaseFieldType.Number:
      return numberFrom(single(items, field), field);
    case DatabaseFieldType.Rating:
      return clampRating(
        numberFrom(single(items, field), field),
        field.options.max
      );
    case DatabaseFieldType.Checkbox:
      return checked(single(items, field)) ? true : null;
    case DatabaseFieldType.Date:
      return dateFrom(single(items, field), field);
    case DatabaseFieldType.SingleSelect: {
      const name = oneLine(itemTitle(single(items, field)));
      return name ? existingChoice(name, field) : null;
    }
    case DatabaseFieldType.MultipleSelect: {
      const names = items.flatMap((item) =>
        typeof item === "string" ? splitNames(item) : [oneLine(itemTitle(item))]
      );
      const unique = Array.from(new Set(names.filter(Boolean)));
      unique.forEach((name) => existingChoice(name, field));
      return unique.length ? unique : null;
    }
    case DatabaseFieldType.User:
      return usersFrom(items, field);
    case DatabaseFieldType.Link:
      return linksFrom(items, field);
    case DatabaseFieldType.Attachment:
      return attachmentsFrom(items, field);
    default:
      throw new Error(`« ${field.name} » cannot be written.`);
  }
}

function isBlank(value: DatabaseCellValue | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  return Array.isArray(value) && value.length === 0;
}

function texts(items: CellItem[]): string[] {
  return items.map(itemTitle);
}

function single(items: CellItem[], field: DatabaseField): CellItem {
  if (items.length > 1) {
    throw new Error(`« ${field.name} » takes a single value.`);
  }
  return items[0];
}

function numberFrom(item: CellItem, field: DatabaseField): number {
  if (typeof item === "number" && Number.isFinite(item)) {
    return item;
  }
  const number =
    typeof item === "string"
      ? parseNumberText(item, formattingOf(field))
      : null;
  if (number === null || !Number.isFinite(number)) {
    throw new Error(`« ${itemTitle(item)} » is not a number (${field.name}).`);
  }
  return number;
}

function checked(item: CellItem): boolean {
  if (typeof item === "boolean") {
    return item;
  }
  if (typeof item === "number") {
    return item !== 0;
  }
  return typeof item === "string" ? checkedByText(item) : true;
}

function dateFrom(item: CellItem, field: DatabaseField): string {
  let ms: number | null = null;
  if (typeof item === "number") {
    ms = item;
  } else if (typeof item === "string") {
    const { date, time } = formattingOf(field);
    const formats = date
      ? [time && time !== "None" ? `${date} ${time}` : date]
      : [];
    ms = parseInstant(item, fieldTimeZone(field), formats);
  }
  if (ms === null || !Number.isFinite(ms)) {
    throw new Error(`« ${itemTitle(item)} » is not a date (${field.name}).`);
  }
  return new Date(ms).toISOString();
}

function existingChoice(name: string, field: DatabaseField): string {
  if (!choiceExists(field, name)) {
    throw new Error(`« ${name} » is not an option of « ${field.name} ».`);
  }
  return name;
}

function usersFrom(items: CellItem[], field: DatabaseField): DatabaseCellValue {
  const seen = new Set<string>();
  const users: DatabaseUserValue[] = [];
  for (const item of items) {
    const id =
      typeof item === "string"
        ? item
        : isAttachmentItem(item)
          ? undefined
          : itemId(item);
    if (!id) {
      throw new Error(
        `« ${itemTitle(item)} » is not a person (${field.name}).`
      );
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const user: DatabaseUserValue = {
      id,
      title: isObjectItem(item) ? itemTitle(item) : "",
    };
    if (
      isObjectItem(item) &&
      "email" in item &&
      typeof item.email === "string"
    ) {
      user.email = item.email;
    }
    users.push(user);
  }
  if (!users.length) {
    return null;
  }
  if (field.options.isMultiple || field.isMultipleCellValue) {
    return users;
  }
  if (users.length > 1) {
    throw new Error(`« ${field.name} » takes a single person.`);
  }
  return users[0];
}

function linksFrom(items: CellItem[], field: DatabaseField): DatabaseCellValue {
  const ids: string[] = [];
  for (const item of items) {
    const id =
      typeof item === "string"
        ? item
        : isAttachmentItem(item)
          ? undefined
          : itemId(item);
    if (!id) {
      throw new Error(`« ${itemTitle(item)} » is not a row (${field.name}).`);
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  if (!field.isMultipleCellValue && ids.length > 1) {
    throw new Error(`« ${field.name} » links to a single row.`);
  }
  const links: DatabaseLinkValue[] = ids.map((id) => ({ id }));
  return links.length ? links : null;
}

function attachmentsFrom(
  items: CellItem[],
  field: DatabaseField
): DatabaseCellValue {
  const attachments: DatabaseAttachmentValue[] = items.map((item) => {
    if (!isAttachmentItem(item) || !item.id) {
      throw new Error(`« ${itemTitle(item)} » is not a file (${field.name}).`);
    }
    return item;
  });
  return attachments.length ? attachments : null;
}

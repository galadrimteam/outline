import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseLinkValue,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import {
  cellIds,
  cellItems,
  isAttachmentItem,
  isObjectItem,
  itemTitle,
} from "./cellValues";
import { isComputedField, isUserOrLinkType, isUserType } from "./fields";
import { cellText } from "./text";
import { choiceExists, oneLine, splitNames, valueFromText } from "./textInput";

/**
 * Converts a stored cell to a field's new type or options, as Teable does:
 * through the text the old field shows, read by the new one (numbers keep
 * their displayed precision, dates their format). A value that fits both
 * types unchanged is kept. Select names must already be choices of the new
 * field (the caller adds those `choicesFor` suggests first): a list turning
 * into a single select keeps its whole text when that is a choice, else its
 * first element that is. People stay people and links stay links to the
 * same table; from anything else they cannot be found without the people or
 * the linked table, and are left empty.
 *
 * @param value the stored cell.
 * @param from the field before the change.
 * @param to the field after the change.
 * @returns the converted cell.
 */
export function convertCell(
  value: DatabaseCellValue,
  from: DatabaseField,
  to: DatabaseField
): DatabaseCellValue {
  if (value === null || value === undefined || isComputedField(to)) {
    return null;
  }
  switch (to.type) {
    case DatabaseFieldType.SingleSelect:
      return toSingleSelect(value, from, to);
    case DatabaseFieldType.MultipleSelect:
      return toMultipleSelect(value, from, to);
    case DatabaseFieldType.User:
      return isUserType(from.type)
        ? toUsers(value, !!to.options.isMultiple)
        : null;
    case DatabaseFieldType.Link:
      return from.type === DatabaseFieldType.Link &&
        from.options.foreignTableId === to.options.foreignTableId
        ? toLinks(value, to.isMultipleCellValue)
        : null;
    case DatabaseFieldType.Attachment:
      return from.type === DatabaseFieldType.Attachment ? value : null;
    default:
      break;
  }
  if (keepsValue(from, to)) {
    return value;
  }
  return valueFromText(cellText(value, from), to);
}

/**
 * Returns the choices a select needs to hold values after a conversion: the
 * text of each value, or of each element of a list, in order of appearance.
 *
 * @param values the stored cells.
 * @param from the field before the change.
 * @returns the choice names, without blanks or repeats.
 */
export function choicesFor(
  values: DatabaseCellValue[],
  from: DatabaseField
): string[] {
  const names = new Set<string>();
  for (const value of values) {
    const items = cellItems(value);
    const texts =
      Array.isArray(value) || from.isMultipleCellValue
        ? items.map((item) => oneLine(itemTitle(item)))
        : [oneLine(cellText(value, from))];
    texts.filter(Boolean).forEach((text) => names.add(text));
  }
  return Array.from(names);
}

function toSingleSelect(
  value: DatabaseCellValue,
  from: DatabaseField,
  to: DatabaseField
): DatabaseCellValue {
  const whole = oneLine(cellText(value, from));
  if (whole && choiceExists(to, whole)) {
    return whole;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const first = cellItems(value)
    .map((item) => oneLine(itemTitle(item)))
    .find((name) => choiceExists(to, name));
  return first ?? null;
}

function toMultipleSelect(
  value: DatabaseCellValue,
  from: DatabaseField,
  to: DatabaseField
): DatabaseCellValue {
  const candidates = Array.isArray(value)
    ? cellItems(value).map((item) => oneLine(itemTitle(item)))
    : splitNames(cellText(value, from));
  let names = candidates.filter((name) => choiceExists(to, name));
  if (!names.length && !Array.isArray(value)) {
    const whole = oneLine(cellText(value, from));
    names = whole && choiceExists(to, whole) ? [whole] : [];
  }
  const unique = Array.from(new Set(names));
  return unique.length ? unique : null;
}

function toUsers(
  value: DatabaseCellValue,
  multiple: boolean
): DatabaseCellValue {
  const users: DatabaseUserValue[] = cellItems(value).flatMap((item) =>
    isObjectItem(item) && !isAttachmentItem(item) && typeof item.id === "string"
      ? [{ id: item.id, title: itemTitle(item) }]
      : []
  );
  if (!users.length) {
    return null;
  }
  return multiple ? users : users[0];
}

function toLinks(
  value: DatabaseCellValue,
  multiple: boolean
): DatabaseCellValue {
  const links: DatabaseLinkValue[] = Array.from(new Set(cellIds(value))).map(
    (id) => ({
      id,
    })
  );
  if (!links.length) {
    return null;
  }
  return multiple ? links : links.slice(0, 1);
}

function keepsValue(from: DatabaseField, to: DatabaseField): boolean {
  return (
    from.type !== DatabaseFieldType.LongText &&
    to.type !== DatabaseFieldType.Rating &&
    from.cellValueType === to.cellValueType &&
    !from.isMultipleCellValue &&
    !to.isMultipleCellValue &&
    !isStructured(from) &&
    !isStructured(to)
  );
}

function isStructured(field: DatabaseField): boolean {
  return (
    isUserOrLinkType(field.type) ||
    field.type === DatabaseFieldType.Attachment ||
    field.type === DatabaseFieldType.MultipleSelect
  );
}

import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseLinkValue,
  DatabaseUserValue,
} from "@shared/databases/types";

/** One element of a cell: a scalar, a person, a linked row or an attachment. */
export type CellItem =
  | string
  | number
  | boolean
  | DatabaseUserValue
  | DatabaseLinkValue
  | DatabaseAttachmentValue;

/** An element that is an object. */
export type ObjectItem =
  | DatabaseUserValue
  | DatabaseLinkValue
  | DatabaseAttachmentValue;

/**
 * Returns the elements of a cell: none for an empty cell, one for a single
 * value.
 *
 * @param value the cell value.
 * @returns the elements, without nulls.
 */
export function cellItems(value: DatabaseCellValue | undefined): CellItem[] {
  if (value === null || value === undefined) {
    return [];
  }
  const items: (CellItem | null)[] = Array.isArray(value) ? value : [value];
  return items.filter(
    (item): item is CellItem => item !== null && item !== undefined
  );
}

/**
 * Whether a cell holds nothing: null, blank text or an empty list.
 *
 * @param value the cell value.
 * @returns true for an empty cell.
 */
export function isEmptyCell(value: DatabaseCellValue | undefined): boolean {
  if (value === null || value === undefined || value === "") {
    return true;
  }
  return Array.isArray(value) && cellItems(value).length === 0;
}

/**
 * Whether an element is an object (person, linked row or attachment).
 *
 * @param item the element.
 * @returns true for objects.
 */
export function isObjectItem(item: CellItem): item is ObjectItem {
  return typeof item === "object" && item !== null;
}

/**
 * Whether an element is an attachment.
 *
 * @param item the element.
 * @returns true for attachments.
 */
export function isAttachmentItem(
  item: CellItem
): item is DatabaseAttachmentValue {
  return isObjectItem(item) && "mimetype" in item;
}

/**
 * Returns the id of an object element.
 *
 * @param item the element.
 * @returns its id, or undefined for scalars.
 */
export function itemId(item: CellItem): string | undefined {
  return isObjectItem(item) && typeof item.id === "string"
    ? item.id
    : undefined;
}

/**
 * Returns the text of an element: the text itself, a number, the title of a
 * person or linked row, the name of an attachment.
 *
 * @param item the element.
 * @returns the text.
 */
export function itemTitle(item: CellItem): string {
  if (!isObjectItem(item)) {
    return String(item);
  }
  if (isAttachmentItem(item)) {
    return item.name ?? "";
  }
  return "title" in item && typeof item.title === "string" ? item.title : "";
}

/**
 * Builds a list cell from elements: texts, numbers, objects, or the texts of
 * mixed or boolean elements (a list holds one kind of value).
 *
 * @param items the elements.
 * @returns the cell value, null for no element.
 */
export function cellFromItems(items: CellItem[]): DatabaseCellValue {
  if (!items.length) {
    return null;
  }
  const strings = items.filter(
    (item): item is string => typeof item === "string"
  );
  if (strings.length === items.length) {
    return strings;
  }
  const numbers = items.filter(
    (item): item is number => typeof item === "number"
  );
  if (numbers.length === items.length) {
    return numbers;
  }
  const attachments = items.filter(isAttachmentItem);
  if (attachments.length === items.length) {
    return attachments;
  }
  const objects = items.filter(
    (item): item is DatabaseUserValue | DatabaseLinkValue =>
      isObjectItem(item) && !isAttachmentItem(item)
  );
  if (objects.length === items.length) {
    return objects;
  }
  return items.map(itemTitle);
}

/**
 * Returns the ids of the objects of a cell.
 *
 * @param value the cell value.
 * @returns the ids.
 */
export function cellIds(value: DatabaseCellValue | undefined): string[] {
  return cellItems(value).flatMap((item) => {
    const id = itemId(item);
    return id ? [id] : [];
  });
}

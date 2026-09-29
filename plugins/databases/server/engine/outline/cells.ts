import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseUserValue,
} from "@shared/databases/types";

/**
 * Tells whether a cell is empty, as Teable leaves it out of a record.
 *
 * @param value the cell value.
 * @returns true for null, undefined and an empty list.
 */
export function isEmptyCell(value: DatabaseCellValue | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Returns the people of a person cell, written as values or as engine user
 * ids, reduced to what the engine keeps (`id`, `title`, `email`).
 *
 * @param value the cell value.
 * @returns the people, in order.
 */
export function personValues(value: DatabaseCellValue): DatabaseUserValue[] {
  if (value === null || value === undefined) {
    return [];
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item): DatabaseUserValue[] => {
    if (typeof item === "string") {
      return item ? [{ id: item, title: "" }] : [];
    }
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string"
    ) {
      return [];
    }
    const title =
      "title" in item && typeof item.title === "string" ? item.title : "";
    const email =
      "email" in item && typeof item.email === "string" && item.email
        ? item.email.toLowerCase()
        : undefined;
    return [email ? { id: item.id, title, email } : { id: item.id, title }];
  });
}

/**
 * Returns the files of an attachment cell.
 *
 * @param value the cell value.
 * @returns the attachment values.
 */
export function attachmentValues(
  value: DatabaseCellValue
): DatabaseAttachmentValue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: unknown[] = value;
  return items.filter(isAttachmentValue);
}

/**
 * Returns text as searches compare it: without case or accents.
 *
 * @param text the text.
 * @returns the comparable text.
 */
export function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase();
}

function isAttachmentValue(value: unknown): value is DatabaseAttachmentValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "mimetype" in value
  );
}

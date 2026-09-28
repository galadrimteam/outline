import type { DatabaseCellValue } from "@shared/databases/types";

/**
 * Returns a cell value as plain text, as a row title or a candidate label.
 *
 * @param value the cell value.
 * @returns the text.
 */
export function cellText(value: DatabaseCellValue | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    const items: (string | number | object)[] = value;
    return items.map(itemText).join(", ");
  }
  return itemText(value);
}

function itemText(item: string | number | boolean | object): string {
  if (typeof item !== "object") {
    return String(item);
  }
  if ("title" in item && typeof item.title === "string") {
    return item.title;
  }
  if ("name" in item && typeof item.name === "string") {
    return item.name;
  }
  return "";
}

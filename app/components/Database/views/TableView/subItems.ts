import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilter,
  DatabaseRecord,
  DatabaseSettings,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";

/** How a table shows the sub-items of its rows, and the two relations that hold them. */
export interface SubItems {
  /** Under their parent, folded (Notion's « Show nested »), or as rows of their own. */
  mode: "nested" | "flattened";
  /** The relation listing a row's sub-items. */
  childrenField: DatabaseField;
  /** The relation holding a row's parent: the symmetric field of `childrenField`. */
  parentField: DatabaseField;
}

interface SubItemsDatabase {
  settings?: DatabaseSettings | null;
  fieldById: (id: string) => DatabaseField | undefined;
}

/**
 * The sub-items of a table view, like Notion's: the database names the
 * relation listing each row's sub-items (`settings.subItemFieldId`), the view
 * nests them under their parent unless it shows them flattened or not at all.
 *
 * @param database the database.
 * @param view the view.
 * @returns the sub-items, or undefined when the view shows none.
 */
export function subItemsOf(
  database: SubItemsDatabase,
  view: Pick<DatabaseView, "layout" | "overrides">
): SubItems | undefined {
  const mode = view.overrides.subItems ?? "nested";
  const fieldId = database.settings?.subItemFieldId;
  if (view.layout !== DatabaseLayout.Table || mode === "off" || !fieldId) {
    return undefined;
  }
  const childrenField = database.fieldById(fieldId);
  const parentId = childrenField?.options.symmetricFieldId;
  const parentField = parentId ? database.fieldById(parentId) : undefined;
  if (
    childrenField?.type !== DatabaseFieldType.Link ||
    parentField?.type !== DatabaseFieldType.Link
  ) {
    return undefined;
  }
  return { mode, childrenField, parentField };
}

/**
 * The rows a nested table lists at its top level: those without a parent.
 *
 * @param subItems the sub-items of the view.
 * @returns the filter.
 */
export function topLevelFilter(subItems: SubItems): DatabaseFilter {
  return {
    conjunction: "and",
    filterSet: [
      { fieldId: subItems.parentField.id, operator: "isEmpty", value: null },
    ],
  };
}

/**
 * The sub-items of one row.
 *
 * @param subItems the sub-items of the view.
 * @param parentId the row.
 * @returns the filter.
 */
export function childrenFilter(
  subItems: SubItems,
  parentId: string
): DatabaseFilter {
  const { parentField } = subItems;
  return {
    conjunction: "and",
    filterSet: [
      parentField.isMultipleCellValue
        ? { fieldId: parentField.id, operator: "hasAnyOf", value: [parentId] }
        : { fieldId: parentField.id, operator: "is", value: parentId },
    ],
  };
}

/**
 * Whether a row has sub-items.
 *
 * @param record the row.
 * @param subItems the sub-items of the view.
 * @returns true when its sub-item relation holds rows.
 */
export function hasSubItems(
  record: DatabaseRecord,
  subItems: SubItems
): boolean {
  return linkTitles(record.fields[subItems.childrenField.id]).length > 0;
}

/**
 * The titles of a row's parents, which a flattened table writes next to its
 * title (Notion's « ↑ Parent »).
 *
 * @param record the row.
 * @param subItems the sub-items of the view.
 * @returns the titles, empty for a row without a parent.
 */
export function parentTitles(
  record: DatabaseRecord,
  subItems: SubItems
): string[] {
  return linkTitles(record.fields[subItems.parentField.id]);
}

function linkTitles(value: DatabaseCellValue | undefined): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.flatMap((item) =>
    typeof item === "object" && item !== null && "id" in item
      ? [("title" in item && item.title) || ""]
      : []
  );
}

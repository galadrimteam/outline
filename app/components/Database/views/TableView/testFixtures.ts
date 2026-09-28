import type { DatabaseField, DatabaseView } from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";

/**
 * A field for tests.
 *
 * @param patch what differs from a plain text field.
 * @returns the field.
 */
export function makeField(patch: Partial<DatabaseField> = {}): DatabaseField {
  return {
    id: "fld",
    name: "Field",
    type: DatabaseFieldType.SingleLineText,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
    ...patch,
  };
}

/**
 * A grid view for tests.
 *
 * @param patch what differs from an empty table view.
 * @returns the view.
 */
export function makeView(patch: Partial<DatabaseView> = {}): DatabaseView {
  return {
    id: "viw",
    name: "Table",
    type: "grid",
    layout: DatabaseLayout.Table,
    order: 0,
    filter: null,
    sort: null,
    group: null,
    columnMeta: {},
    options: {},
    overrides: {},
    isLocked: false,
    ...patch,
  };
}

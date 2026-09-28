import type { DatabaseCellValue } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type {
  EngineFieldRow,
  EngineRecordRow,
  EngineViewRow,
  TableSnapshot,
} from "../types";
import { naturalType } from "./computed/inferType";
import type { QueryContext } from "./contract";
import { isComputedField } from "./fields";
import { compileFormula } from "./formula/compiler";
import type { Value, ValueType } from "./formula/values";

/** Paris, the zone of every Galadrim database. */
export const PARIS = "Europe/Paris";

/**
 * Builds a field row for tests; the value type defaults to the type's own.
 *
 * @param field the properties that matter to the test.
 * @returns the field row.
 */
export function makeField(
  field: Partial<EngineFieldRow> & Pick<EngineFieldRow, "id" | "type">
): EngineFieldRow {
  const natural = naturalType({
    type: field.type,
    options: field.options ?? {},
  });
  const row: EngineFieldRow = {
    tableId: "",
    name: field.id,
    description: null,
    options: {},
    lookupOptions: null,
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: natural.type,
    isMultipleCellValue: natural.isMultiple,
    order: 0,
    ...field,
  };
  row.isComputed = row.isComputed || isComputedField(row);
  return row;
}

/**
 * Builds a formula field.
 *
 * @param id the field id.
 * @param expression the formula.
 * @param cellValueType what the formula gives.
 * @param extra other properties.
 * @returns the field row.
 */
export function formulaField(
  id: string,
  expression: string,
  cellValueType: EngineFieldRow["cellValueType"],
  extra: Partial<EngineFieldRow> = {}
): EngineFieldRow {
  return makeField({
    id,
    type: DatabaseFieldType.Formula,
    cellValueType,
    isMultipleCellValue: false,
    isComputed: true,
    ...extra,
    options: { expression, timeZone: PARIS, ...extra.options },
  });
}

/**
 * Builds a record row; records of a table get auto numbers in order.
 *
 * @param id the record id.
 * @param cells the stored cells.
 * @param extra other properties.
 * @returns the record row.
 */
export function makeRecord(
  id: string,
  cells: Record<string, DatabaseCellValue>,
  extra: Partial<EngineRecordRow> = {}
): EngineRecordRow {
  return {
    id,
    tableId: "",
    cells,
    autoNumber: 0,
    orders: {},
    createdTime: "2025-01-01T09:00:00.000Z",
    lastModifiedTime: "2025-01-02T09:00:00.000Z",
    createdBy: "user-1",
    lastModifiedBy: "user-2",
    ...extra,
  };
}

/**
 * Builds a table snapshot; fields and records are attached to it, records
 * without an auto number are numbered in order.
 *
 * @param id the table id.
 * @param fields the fields, the first one primary unless another is.
 * @param records the records.
 * @param views the views.
 * @returns the snapshot.
 */
export function makeTable(
  id: string,
  fields: EngineFieldRow[],
  records: EngineRecordRow[] = [],
  views: EngineViewRow[] = []
): TableSnapshot {
  const hasPrimary = fields.some((field) => field.isPrimary);
  return {
    table: { id, baseId: "bseTest", teamId: "team", name: id, version: 1 },
    fields: fields.map((field, index) => ({
      ...field,
      tableId: id,
      order: index,
      isPrimary: field.isPrimary || (!hasPrimary && index === 0),
    })),
    records: records.map((record, index) => ({
      ...record,
      tableId: id,
      autoNumber: record.autoNumber || index + 1,
    })),
    views: views.map((view) => ({ ...view, tableId: id })),
  };
}

/**
 * Builds a view row.
 *
 * @param view the properties that matter to the test.
 * @returns the view row.
 */
export function makeView(
  view: Partial<EngineViewRow> & Pick<EngineViewRow, "id">
): EngineViewRow {
  return {
    tableId: "",
    name: view.id,
    type: "grid",
    order: 0,
    description: null,
    filter: null,
    sort: null,
    group: null,
    columnMeta: {},
    options: {},
    isLocked: false,
    ...view,
  };
}

/** A formula's type and value, dates as UTC milliseconds. */
export interface Evaluation {
  type: ValueType;
  value: Value;
}

/**
 * Compiles and runs a formula once, for tests.
 *
 * @param expression the formula.
 * @param options the fields it may reference, the record's cells, the clock and zone.
 * @returns the type and value.
 */
export function evaluate(
  expression: string,
  options: {
    fields?: EngineFieldRow[];
    cells?: Record<string, DatabaseCellValue>;
    now?: string;
    timeZone?: string;
  } = {}
): Evaluation {
  const fields = options.fields ?? [];
  const compiled = compileFormula(expression, (reference) =>
    fields.find((field) => field.id === reference)
  );
  const value = compiled.run({
    cells: options.cells ?? {},
    record: {
      id: "recTest",
      autoNumber: 7,
      createdTime: "2025-01-01T09:00:00.000Z",
      lastModifiedTime: "2025-01-02T09:00:00.000Z",
    },
    now: Date.parse(options.now ?? "2025-06-15T10:30:00.000Z"),
    timeZone: options.timeZone ?? PARIS,
  });
  return { type: compiled.type, value };
}

/**
 * Builds a read context at an instant, in Paris.
 *
 * @param iso the current instant.
 * @param userId the reader.
 * @returns the context.
 */
export function contextAt(iso: string, userId?: string): QueryContext {
  return { now: new Date(iso), timeZone: PARIS, userId };
}

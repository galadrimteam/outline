import type {
  DatabaseCellValue,
  DatabaseCellValueType,
  DatabaseColumnMeta,
  DatabaseEngineViewType,
  DatabaseFieldOptions,
  DatabaseFieldType,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseLookupOptions,
  DatabaseSort,
  DatabaseViewOptions,
} from "@shared/databases/types";

/**
 * The Outline engine keeps a database's data in Outline's own Postgres, with
 * the ids, field types, filters and view options of the Teable vocabulary
 * (shared/databases/types.ts), so that a table moved from Teable keeps every id
 * and the app sees no difference.
 *
 * Engine user ids are Outline user ids; a person who is no Outline user (kept
 * from Notion or Teable) is `email:<lower-cased address>`.
 */

/** A table, the unit of a database's data. Tables of a base may link to each other. */
export interface EngineTableRow {
  /** `tbl` + 16 letters or digits, or the Teable id of a table moved from Teable. */
  id: string;
  /** `bse` + 16 letters or digits, or the Teable base id. */
  baseId: string;
  teamId: string;
  name: string;
  /** Bumped by every write, so that per-process caches know when to reload. */
  version: number;
}

export interface EngineFieldRow {
  /** `fld` + 16 letters or digits. */
  id: string;
  tableId: string;
  name: string;
  type: DatabaseFieldType;
  description: string | null;
  options: DatabaseFieldOptions;
  /** For lookup fields and rollups: through which link, to which field. */
  lookupOptions: DatabaseLookupOptions | null;
  isPrimary: boolean;
  /** Formula, rollup, lookup, auto number, created/modified time or by: never written. */
  isComputed: boolean;
  isLookup: boolean;
  /** What the cells hold, inferred for computed fields when they are created or converted. */
  cellValueType: DatabaseCellValueType;
  isMultipleCellValue: boolean;
  /** Position among the table's fields (the default column order). */
  order: number;
}

export interface EngineViewRow {
  /** `viw` + 16 letters or digits. */
  id: string;
  tableId: string;
  name: string;
  type: DatabaseEngineViewType;
  order: number;
  description: string | null;
  filter: DatabaseFilter | null;
  sort: DatabaseSort | null;
  group: DatabaseGroup | null;
  columnMeta: Record<string, DatabaseColumnMeta>;
  options: DatabaseViewOptions;
  isLocked: boolean;
}

export interface EngineRecordRow {
  /** `rec` + 16 letters or digits. */
  id: string;
  tableId: string;
  /**
   * Stored cells, by field id; computed fields are never stored. A link cell
   * holds `DatabaseLinkValue[]` with ids only (titles are computed), a person
   * cell `DatabaseUserValue` or a list of them, an attachment cell
   * `DatabaseAttachmentValue[]`, a date an ISO 8601 string.
   */
  cells: Record<string, DatabaseCellValue>;
  /** 1, 2, 3… per table, in creation order: the order of a view nobody sorted. */
  autoNumber: number;
  /** Manual position in each view, by view id; a view without one uses autoNumber. */
  orders: Record<string, number>;
  createdTime: string;
  lastModifiedTime: string;
  /** Engine user ids. */
  createdBy: string | null;
  lastModifiedBy: string | null;
}

/** One table with all of its data, as a read sees it. */
export interface TableSnapshot {
  table: EngineTableRow;
  fields: EngineFieldRow[];
  views: EngineViewRow[];
  records: EngineRecordRow[];
}

/** A cell change kept for the record's history. */
export interface EngineHistoryRow {
  id: string;
  tableId: string;
  recordId: string;
  fieldId: string;
  before: DatabaseCellValue;
  after: DatabaseCellValue;
  /** Engine user id. */
  actorId: string | null;
  createdAt: string;
}

/** What one write changes in one table. Absent keys change nothing. */
export interface EngineTableMutation {
  tableId: string;
  /** New name of the table. */
  name?: string;
  records?: {
    /** New records; the store assigns autoNumber when it is 0. */
    insert?: EngineRecordRow[];
    /**
     * Cells to set (a null value clears a cell) and view positions to set on
     * existing records; the store stamps lastModifiedTime/By.
     */
    update?: EngineRecordUpdate[];
    delete?: string[];
  };
  fields?: { upsert?: EngineFieldRow[]; delete?: string[] };
  views?: { upsert?: EngineViewRow[]; delete?: string[] };
  history?: EngineHistoryRow[];
}

export interface EngineRecordUpdate {
  id: string;
  cells?: Record<string, DatabaseCellValue>;
  orders?: Record<string, number>;
  /** Removes a field's cell from every record when a field is deleted or converted. */
  unsetFieldIds?: string[];
}

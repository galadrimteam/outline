import type {
  DatabaseCellValue,
  DatabaseCellValueType,
  DatabaseField,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseGroupPoint,
  DatabaseSort,
  DatabaseStatisticFunc,
} from "@shared/databases/types";
import type {
  EngineFieldRow,
  EngineRecordRow,
  EngineViewRow,
  TableSnapshot,
} from "../types";

/** What a read depends on besides the data. */
export interface QueryContext {
  now: Date;
  /** Engine user id of the reader: what `Me` means in a person filter. Absent for background work. */
  userId?: string;
  /** Time zone of dates and date filters that carry none (Europe/Paris). */
  timeZone: string;
}

/** A record with its stored cells and every computed cell of its table filled in. */
export interface ComputedRecord {
  row: EngineRecordRow;
  /**
   * Stored and computed cells by field id: formulas, rollups, lookups, the
   * titles of linked records, created/modified time and by, auto number.
   */
  cells: Record<string, DatabaseCellValue>;
}

/** The tables of a base with their computed cells. */
export interface ComputedBase {
  /** The records of a table, in autoNumber order; empty for an unknown table. */
  records(tableId: string): ComputedRecord[];
  record(tableId: string, recordId: string): ComputedRecord | undefined;
}

/** Which records of a table a read wants, and in which order. */
export interface RecordSelection {
  /** Its filter, sort and group apply, and its manual order breaks ties. */
  view?: EngineViewRow;
  /** ANDed with the view's filter, or replacing it with `replaceFilter`. */
  filter?: DatabaseFilter | null;
  replaceFilter?: boolean;
  /** Sorted before the view's sort. */
  sort?: DatabaseSort | null;
  /** Matches the displayed text of any field, case and accents ignored. */
  search?: string;
}

export interface InferredType {
  cellValueType: DatabaseCellValueType;
  isMultipleCellValue: boolean;
  /** Why the expression cannot be computed: a syntax error, an unknown field or function. */
  error?: string;
}

/**
 * Everything the Outline engine computes, as pure functions of the data: no
 * database, no clock but `context.now`. Same meaning as Teable wherever Teable
 * defines one (filters, sorts, group points, statistics, conversions), and the
 * same formula language (`{fieldId}` references, Teable's function names).
 */
export interface OutlineQuery {
  /**
   * Computes every computed cell of a base's tables, across tables in
   * dependency order (a rollup may read a formula of another table, a formula
   * a rollup). A cycle or an expression that fails gives null, never throws.
   */
  computeBase(tables: TableSnapshot[], context: QueryContext): ComputedBase;

  /**
   * The records of a table a read shows, in order: filters, then search, then
   * the selection's sort, the view's sort, the view's grouping (grouped rows
   * together, groups in their order), the view's manual order
   * (`row.orders[view.id]`), and finally autoNumber.
   */
  select(
    table: TableSnapshot,
    base: ComputedBase,
    selection: RecordSelection,
    context: QueryContext
  ): ComputedRecord[];

  /**
   * Group headers and row counts of already selected records, as Teable
   * answers them (see TeableMapper.groupPoints and the board and table views
   * that read them): a header per distinct value per level, in sort order,
   * followed by the count of its rows.
   */
  groupPoints(
    table: TableSnapshot,
    records: ComputedRecord[],
    group: DatabaseGroup
  ): DatabaseGroupPoint[];

  /** One statistic per field over already selected records. */
  aggregate(
    table: TableSnapshot,
    records: ComputedRecord[],
    fieldStats: Record<string, DatabaseStatisticFunc>
  ): Record<string, { value: number | string | null }>;

  /**
   * The type a formula, rollup or lookup gives its field, or the error that
   * keeps it from being computed.
   */
  inferType(
    field: Pick<EngineFieldRow, "type" | "options" | "lookupOptions">,
    table: TableSnapshot,
    tables: TableSnapshot[]
  ): InferredType;

  /**
   * A stored cell after its field changes type or options, as Teable converts
   * it (text to select creates no choice by itself: the caller adds the
   * choices `choicesFor` suggests first).
   */
  convertCell(
    value: DatabaseCellValue,
    from: DatabaseField,
    to: DatabaseField
  ): DatabaseCellValue;

  /** The choices a select needs to hold the given values after a conversion. */
  choicesFor(values: DatabaseCellValue[], from: DatabaseField): string[];

  /**
   * A written cell checked and normalized for its field: numbers from text,
   * select names that must exist, dates to ISO 8601, links to `{id}` lists,
   * checkboxes to true or null.
   *
   * @throws Error with a message fit for the user when the value cannot go in.
   */
  normalizeInput(value: DatabaseCellValue, field: DatabaseField): DatabaseCellValue;

  /** The text a cell shows (search, link titles, text conversions). */
  cellText(value: DatabaseCellValue, field: DatabaseField): string;

  /**
   * `count` positions strictly between two neighbours' positions (either may
   * be absent: first or last place), evenly spread.
   */
  positionsBetween(
    before: number | undefined,
    after: number | undefined,
    count: number
  ): number[];
}

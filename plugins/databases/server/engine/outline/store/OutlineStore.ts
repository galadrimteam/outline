import type {
  EngineFieldRow,
  EngineHistoryRow,
  EngineRecordRow,
  EngineTableMutation,
  EngineTableRow,
  EngineViewRow,
  TableSnapshot,
} from "../types";

/**
 * Where the Outline engine keeps its tables: Outline's Postgres in
 * production, memory in tests. Reads come from a per-process cache that is
 * reloaded when the table's version has changed.
 */
export interface OutlineStore {
  /**
   * A table with its fields, views and records.
   *
   * @throws NotFoundError when the table does not exist.
   */
  table(tableId: string): Promise<TableSnapshot>;

  /** Every table of a base (links, lookups and rollups stay inside a base). */
  base(baseId: string): Promise<TableSnapshot[]>;

  /** Creates an empty base and returns its id (`bse…`). */
  createBase(teamId: string, name: string): Promise<string>;

  /**
   * Creates a table with its fields, views and records; `table.id` may be
   * given (a table moved from Teable keeps its id).
   */
  createTable(input: {
    table: Omit<EngineTableRow, "version">;
    fields: EngineFieldRow[];
    views: EngineViewRow[];
    records?: EngineRecordRow[];
  }): Promise<TableSnapshot>;

  /**
   * Applies mutations to one or several tables in one transaction, bumping
   * each table's version. `actorId` (an engine user id) stamps the updated
   * records' lastModifiedBy, and `now` their lastModifiedTime.
   */
  apply(
    mutations: EngineTableMutation[],
    actorId: string | null,
    now: Date
  ): Promise<void>;

  /** A record's history, newest first, a page at a time. */
  history(
    tableId: string,
    recordId: string,
    cursor?: string,
    limit?: number
  ): Promise<{ entries: EngineHistoryRow[]; nextCursor: string | null }>;

  /** Deletes a table and everything in it. */
  deleteTable(tableId: string): Promise<void>;

  /**
   * The team owning a table, without loading its data.
   *
   * @returns the team id, null when the table does not exist.
   */
  tableTeamId(tableId: string): Promise<string | null>;
}

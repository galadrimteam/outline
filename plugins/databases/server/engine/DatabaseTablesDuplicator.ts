import type { DatabaseActor } from "./DatabaseEngine";

/**
 * Copies engine tables, for project templates: the tables duplicated together
 * keep their relations between the copies. Kept apart from `DatabaseEngine`,
 * which serves the routes of a single table.
 */
export interface DatabaseTablesDuplicator {
  /**
   * Duplicates tables of one base into that base, with their fields, views
   * and optionally their records. A link between two of the tables points,
   * in the copies, from one copy to the other; a link to a table left out
   * keeps pointing to that table.
   *
   * @param actor the person the copies are made for.
   * @param input the base, the tables and whether to copy the records.
   * @returns the copy of each table, in the order of the input.
   */
  duplicateTables(
    actor: DatabaseActor,
    input: DatabaseTablesDuplicate
  ): Promise<DatabaseDuplicatedTable[]>;
}

export interface DatabaseTablesDuplicate {
  externalBaseId: string;
  tables: DatabaseTableToDuplicate[];
  withRecords: boolean;
}

export interface DatabaseTableToDuplicate {
  externalTableId: string;
  /** The name of the copy. */
  name: string;
}

export interface DatabaseDuplicatedTable {
  /** The table that was copied. */
  sourceTableId: string;
  /** The copy. */
  externalTableId: string;
  /** Engine id of each field of the copy, keyed by the id of its source field. */
  fieldIds: Record<string, string>;
  /** Engine id of each view of the copy, keyed by the id of its source view. */
  viewIds: Record<string, string>;
}

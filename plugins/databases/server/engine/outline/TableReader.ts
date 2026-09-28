import { uniq } from "es-toolkit/compat";
import { NotFoundError, ValidationError } from "@server/errors";
import type { DatabaseRef } from "../DatabaseEngine";
import type { ComputedBaseCache } from "./ComputedBaseCache";
import type { ComputedBase, OutlineQuery } from "./query/contract";
import type { OutlineStore } from "./store/OutlineStore";
import type { TableSnapshot } from "./types";
import type { WriteBatch } from "./WriteBatch";

/** The tables a read needs and their computed cells. */
export interface ReadState {
  /** The table read, its base, and the tables its links reach in other bases. */
  tables: TableSnapshot[];
  table: TableSnapshot;
  computed: ComputedBase;
}

export interface TableReaderOptions {
  store: OutlineStore;
  query: OutlineQuery;
  computedBases: ComputedBaseCache;
  /** The team the tables must belong to; any team when not given. */
  teamId?: string;
  /** Time zone of dates that carry none. */
  timeZone: string;
}

/**
 * Loads the tables of the Outline engine the way a read or a write needs
 * them: a table with its base and every table its links, lookups and rollups
 * reach, their cells computed (once per set of table versions). A table of
 * another team is reported as not found.
 */
export class TableReader {
  /**
   * @param options the store, the query functions and the team.
   */
  constructor(private readonly options: TableReaderOptions) {}

  /**
   * Returns a table alone, for the calls that do not compute cells.
   *
   * @param ref the engine table.
   * @returns the table.
   * @throws NotFoundError when the table does not exist or is another team's.
   */
  public async table(ref: DatabaseRef): Promise<TableSnapshot> {
    const table = await this.options.store.table(ref.externalTableId);
    this.checkTeam(table);
    return table;
  }

  /**
   * Returns a table with the tables it reads and their computed cells.
   *
   * @param ref the engine table.
   * @returns the read state.
   * @throws NotFoundError when the table does not exist or is another team's.
   */
  public async read(ref: DatabaseRef): Promise<ReadState> {
    let tables = await this.options.store.base(ref.externalBaseId);
    let table = tables.find((item) => item.table.id === ref.externalTableId);
    if (!table) {
      const alone = await this.options.store.table(ref.externalTableId);
      tables = await this.options.store.base(alone.table.baseId);
      table = tables.find((item) => item.table.id === ref.externalTableId);
    }
    if (!table) {
      throw NotFoundError("Table not found");
    }
    this.checkTeam(table);
    tables = await this.withLinkedTables(tables, table.table.teamId);
    return { tables, table, computed: this.compute(tables) };
  }

  /**
   * Makes the table a link points to part of a write, loading it from another
   * base when needed.
   *
   * @param batch the write.
   * @param table the table of the link.
   * @param foreignTableId the linked table.
   * @throws ValidationError when the linked table is not an Outline engine
   * table of the same team.
   */
  public async addLinkedTable(
    batch: WriteBatch,
    table: TableSnapshot,
    foreignTableId: string | undefined
  ) {
    if (!foreignTableId) {
      throw ValidationError("A relation needs a database to link to");
    }
    if (batch.hasTable(foreignTableId)) {
      return;
    }
    const foreign = await this.tryTable(foreignTableId);
    if (!foreign || foreign.table.teamId !== table.table.teamId) {
      throw ValidationError(
        "The linked database does not keep its data in Outline"
      );
    }
    batch.addTable(foreign);
  }

  private checkTeam(table: TableSnapshot) {
    if (this.options.teamId && table.table.teamId !== this.options.teamId) {
      throw NotFoundError("Table not found");
    }
  }

  private async withLinkedTables(
    tables: TableSnapshot[],
    teamId: string
  ): Promise<TableSnapshot[]> {
    const result = [...tables];
    const known = new Set(result.map((snapshot) => snapshot.table.id));
    let pending = foreignTableIds(result).filter((id) => !known.has(id));
    while (pending.length) {
      for (const tableId of pending) {
        known.add(tableId);
        const snapshot = await this.tryTable(tableId);
        if (snapshot?.table.teamId === teamId) {
          result.push(snapshot);
        }
      }
      pending = foreignTableIds(result).filter((id) => !known.has(id));
    }
    return result;
  }

  private async tryTable(tableId: string): Promise<TableSnapshot | undefined> {
    try {
      return await this.options.store.table(tableId);
    } catch (err) {
      if (isNotFound(err)) {
        return undefined;
      }
      throw err;
    }
  }

  private compute(tables: TableSnapshot[]): ComputedBase {
    return this.options.computedBases.getOrCompute(tables, () =>
      this.options.query.computeBase(tables, {
        now: new Date(),
        timeZone: this.options.timeZone,
      })
    );
  }
}

function foreignTableIds(tables: TableSnapshot[]): string[] {
  return uniq(
    tables.flatMap((snapshot) =>
      snapshot.fields.flatMap((field) =>
        [
          field.options.foreignTableId,
          field.lookupOptions?.foreignTableId,
        ].filter((id): id is string => !!id)
      )
    )
  );
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    err.status === 404
  );
}

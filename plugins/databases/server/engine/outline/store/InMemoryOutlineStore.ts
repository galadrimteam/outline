import { NotFoundError } from "@server/errors";
import { generateEngineId } from "../ids";
import type {
  EngineFieldRow,
  EngineHistoryRow,
  EngineRecordRow,
  EngineTableMutation,
  EngineTableRow,
  EngineViewRow,
  TableSnapshot,
} from "../types";
import type { OutlineStore } from "./OutlineStore";
import { applyMutation } from "./applyMutation";
import { decodeHistoryCursor, encodeHistoryCursor } from "./historyCursor";

/**
 * An Outline store kept in memory, for tests of the engine and of the code
 * built on it. Same contract as the Postgres store: reads return copies, so
 * that a caller changing a snapshot changes nothing stored.
 */
export class InMemoryOutlineStore implements OutlineStore {
  async table(tableId: string): Promise<TableSnapshot> {
    const snapshot = this.tables.get(tableId);
    if (!snapshot) {
      throw NotFoundError("Table not found");
    }
    return structuredClone(snapshot);
  }

  async base(baseId: string): Promise<TableSnapshot[]> {
    return [...this.tables.values()]
      .filter((snapshot) => snapshot.table.baseId === baseId)
      .map((snapshot) => structuredClone(snapshot));
  }

  async createBase(_teamId: string, _name: string): Promise<string> {
    return generateEngineId("bse");
  }

  async createTable(input: {
    table: Omit<EngineTableRow, "version">;
    fields: EngineFieldRow[];
    views: EngineViewRow[];
    records?: EngineRecordRow[];
  }): Promise<TableSnapshot> {
    const id = input.table.id || generateEngineId("tbl");
    const empty: TableSnapshot = {
      table: { ...input.table, id, version: 0 },
      fields: [],
      views: [],
      records: [],
    };
    const { snapshot } = applyMutation(
      empty,
      {
        tableId: id,
        fields: {
          upsert: input.fields.map((field) => ({ ...field, tableId: id })),
        },
        views: {
          upsert: input.views.map((view) => ({ ...view, tableId: id })),
        },
        records: {
          insert: (input.records ?? []).map((record) => ({
            ...record,
            tableId: id,
          })),
        },
      },
      null,
      new Date()
    );
    const created = { ...snapshot, table: { ...snapshot.table, version: 1 } };
    this.tables.set(id, structuredClone(created));
    return structuredClone(created);
  }

  async apply(
    mutations: EngineTableMutation[],
    actorId: string | null,
    now: Date
  ): Promise<void> {
    const next = new Map<string, TableSnapshot>();
    const history: EngineHistoryRow[] = [];
    for (const mutation of mutations) {
      const current =
        next.get(mutation.tableId) ?? this.tables.get(mutation.tableId);
      if (!current) {
        throw NotFoundError("Table not found");
      }
      const applied = applyMutation(current, mutation, actorId, now);
      // Several mutations of one table in one call bump its version once.
      const version = next.has(mutation.tableId)
        ? current.table.version
        : applied.snapshot.table.version;
      next.set(mutation.tableId, {
        ...applied.snapshot,
        table: { ...applied.snapshot.table, version },
      });
      history.push(...applied.history);

      const deleted = new Set(mutation.records?.delete ?? []);
      if (deleted.size) {
        this.historyRows = this.historyRows.filter(
          (row) => !deleted.has(row.recordId)
        );
      }
    }
    for (const [tableId, snapshot] of next) {
      this.tables.set(tableId, structuredClone(snapshot));
    }
    this.historyRows.push(...structuredClone(history));
  }

  async history(
    tableId: string,
    recordId: string,
    cursor?: string,
    limit = 50
  ): Promise<{ entries: EngineHistoryRow[]; nextCursor: string | null }> {
    const after = cursor ? decodeHistoryCursor(cursor) : undefined;
    const rows = this.historyRows
      .filter((row) => row.tableId === tableId && row.recordId === recordId)
      .sort(newestFirst)
      .filter(
        (row) =>
          !after ||
          row.createdAt < after.createdAt ||
          (row.createdAt === after.createdAt && row.id < after.id)
      );
    const entries = rows.slice(0, limit);
    const last = entries[entries.length - 1];
    return {
      entries: structuredClone(entries),
      nextCursor:
        rows.length > limit && last ? encodeHistoryCursor(last) : null,
    };
  }

  async deleteTable(tableId: string): Promise<void> {
    this.tables.delete(tableId);
    this.historyRows = this.historyRows.filter(
      (row) => row.tableId !== tableId
    );
  }

  private tables = new Map<string, TableSnapshot>();

  private historyRows: EngineHistoryRow[] = [];
}

function newestFirst(a: EngineHistoryRow, b: EngineHistoryRow): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

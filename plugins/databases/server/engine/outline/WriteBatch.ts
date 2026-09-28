import { randomUUID } from "node:crypto";
import { isEqual } from "es-toolkit";
import type { DatabaseCellValue } from "@shared/databases/types";
import { NotFoundError } from "@server/errors";
import type {
  EngineFieldRow,
  EngineHistoryRow,
  EngineRecordRow,
  EngineRecordUpdate,
  EngineTableMutation,
  EngineViewRow,
  TableSnapshot,
} from "./types";

export interface WriteBatchOptions {
  /** Engine user id of the person writing. */
  actorId: string | null;
  now: Date;
  /** Whether cell changes of existing records go into their history. */
  history: boolean;
}

/** What a batch changed in one table, for the change notification. */
export interface WriteBatchTableSummary {
  tableId: string;
  created: string[];
  /** Records whose cells or positions changed. */
  updated: string[];
  deleted: string[];
  fieldIds: string[];
  viewIds: string[];
}

/**
 * The changes of one engine write, gathered over the snapshots the write
 * started from: reads see the changes made so far, and `mutations` turns
 * what really changed into the store's mutations, with the history of the
 * cells of existing records.
 */
export class WriteBatch {
  /**
   * @param tables the tables the write starts from.
   * @param options who writes, when, and whether history is kept.
   */
  constructor(
    tables: TableSnapshot[],
    private readonly options: WriteBatchOptions
  ) {
    for (const snapshot of tables) {
      this.addTable(snapshot);
    }
  }

  /**
   * Makes a table the write did not start with available, a link target in
   * another base for example.
   *
   * @param snapshot the table.
   */
  public addTable(snapshot: TableSnapshot) {
    if (!this.tables.has(snapshot.table.id)) {
      this.tables.set(snapshot.table.id, {
        snapshot,
        records: new Map(snapshot.records.map((record) => [record.id, record])),
        inserted: new Map(),
        cells: new Map(),
        orders: new Map(),
        deleted: new Set(),
        fields: new Map(),
        deletedFields: new Set(),
        views: new Map(),
        deletedViews: new Set(),
      });
    }
  }

  /**
   * Tells whether a table is known to the batch.
   *
   * @param tableId the table.
   * @returns true when the batch holds it.
   */
  public hasTable(tableId: string): boolean {
    return this.tables.has(tableId);
  }

  /**
   * Returns a table as the write started from it.
   *
   * @param tableId the table.
   * @returns the snapshot.
   * @throws NotFoundError when the batch does not hold the table.
   */
  public snapshot(tableId: string): TableSnapshot {
    return this.state(tableId).snapshot;
  }

  /**
   * Returns the ids of the tables the batch holds.
   *
   * @returns the table ids.
   */
  public tableIds(): string[] {
    return [...this.tables.keys()];
  }

  /**
   * Returns a table's fields with the changes of the batch, in order.
   *
   * @param tableId the table.
   * @returns the fields.
   */
  public fields(tableId: string): EngineFieldRow[] {
    const state = this.state(tableId);
    return mergeRows(
      state.snapshot.fields,
      state.fields,
      state.deletedFields
    ).sort((a, b) => a.order - b.order);
  }

  /**
   * Returns a field of a table with the changes of the batch.
   *
   * @param tableId the table.
   * @param fieldId the field.
   * @returns the field, or undefined.
   */
  public field(tableId: string, fieldId: string): EngineFieldRow | undefined {
    if (!this.tables.has(tableId)) {
      return undefined;
    }
    return this.fields(tableId).find((field) => field.id === fieldId);
  }

  /**
   * Returns a table's views with the changes of the batch, in order.
   *
   * @param tableId the table.
   * @returns the views.
   */
  public views(tableId: string): EngineViewRow[] {
    const state = this.state(tableId);
    return mergeRows(
      state.snapshot.views,
      state.views,
      state.deletedViews
    ).sort((a, b) => a.order - b.order);
  }

  /**
   * Returns a record with the changes of the batch.
   *
   * @param tableId the table.
   * @param recordId the record.
   * @returns the record, or undefined when it does not exist or is deleted.
   */
  public record(
    tableId: string,
    recordId: string
  ): EngineRecordRow | undefined {
    const state = this.tables.get(tableId);
    if (!state || state.deleted.has(recordId)) {
      return undefined;
    }
    const inserted = state.inserted.get(recordId);
    if (inserted) {
      return inserted;
    }
    const original = state.records.get(recordId);
    if (!original) {
      return undefined;
    }
    const cells = state.cells.get(recordId);
    const orders = state.orders.get(recordId);
    if (!cells && !orders) {
      return original;
    }
    const merged = { ...original.cells };
    for (const [fieldId, value] of cells ?? []) {
      if (value === null) {
        delete merged[fieldId];
      } else {
        merged[fieldId] = value;
      }
    }
    return {
      ...original,
      cells: merged,
      orders: { ...original.orders, ...orders },
    };
  }

  /**
   * Returns a table's records with the changes of the batch, in autoNumber
   * order, inserted records last.
   *
   * @param tableId the table.
   * @returns the records.
   */
  public records(tableId: string): EngineRecordRow[] {
    const state = this.state(tableId);
    const records: EngineRecordRow[] = [];
    for (const id of [...state.records.keys(), ...state.inserted.keys()]) {
      const record = this.record(tableId, id);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  /**
   * Returns a cell with the changes of the batch.
   *
   * @param tableId the table.
   * @param recordId the record.
   * @param fieldId the field.
   * @returns the cell value, null when empty.
   */
  public cell(
    tableId: string,
    recordId: string,
    fieldId: string
  ): DatabaseCellValue {
    const state = this.tables.get(tableId);
    if (!state) {
      return null;
    }
    const inserted = state.inserted.get(recordId);
    if (inserted) {
      return inserted.cells[fieldId] ?? null;
    }
    const changes = state.cells.get(recordId);
    if (changes?.has(fieldId)) {
      return changes.get(fieldId) ?? null;
    }
    return state.records.get(recordId)?.cells[fieldId] ?? null;
  }

  /**
   * Sets a cell; null clears it.
   *
   * @param tableId the table.
   * @param recordId the record, existing or inserted by the batch.
   * @param fieldId the field.
   * @param value the value.
   * @throws NotFoundError when the record does not exist.
   */
  public setCell(
    tableId: string,
    recordId: string,
    fieldId: string,
    value: DatabaseCellValue
  ) {
    const state = this.state(tableId);
    const normalized = isEmptyValue(value) ? null : value;
    const inserted = state.inserted.get(recordId);
    if (inserted) {
      if (normalized === null) {
        delete inserted.cells[fieldId];
      } else {
        inserted.cells[fieldId] = normalized;
      }
      return;
    }
    if (!state.records.has(recordId) || state.deleted.has(recordId)) {
      throw NotFoundError("Record not found");
    }
    const changes = state.cells.get(recordId) ?? new Map();
    changes.set(fieldId, normalized);
    state.cells.set(recordId, changes);
  }

  /**
   * Sets a record's manual position in a view.
   *
   * @param tableId the table.
   * @param recordId the record.
   * @param viewId the view.
   * @param position the position.
   */
  public setPosition(
    tableId: string,
    recordId: string,
    viewId: string,
    position: number
  ) {
    const state = this.state(tableId);
    const inserted = state.inserted.get(recordId);
    if (inserted) {
      inserted.orders = { ...inserted.orders, [viewId]: position };
      return;
    }
    if (!state.records.has(recordId)) {
      throw NotFoundError("Record not found");
    }
    state.orders.set(recordId, {
      ...state.orders.get(recordId),
      [viewId]: position,
    });
  }

  /**
   * Adds a record; an autoNumber of 0 is given by the store.
   *
   * @param record the record.
   */
  public insertRecord(record: EngineRecordRow) {
    const state = this.state(record.tableId);
    state.inserted.set(record.id, {
      ...record,
      cells: { ...record.cells },
      orders: { ...record.orders },
    });
  }

  /**
   * Deletes records.
   *
   * @param tableId the table.
   * @param recordIds the records.
   */
  public deleteRecords(tableId: string, recordIds: string[]) {
    const state = this.state(tableId);
    for (const id of recordIds) {
      if (state.inserted.delete(id)) {
        continue;
      }
      if (state.records.has(id)) {
        state.deleted.add(id);
        state.cells.delete(id);
        state.orders.delete(id);
      }
    }
  }

  /**
   * Renames a table.
   *
   * @param tableId the table.
   * @param name the new name.
   */
  public rename(tableId: string, name: string) {
    this.state(tableId).name = name;
  }

  /**
   * Adds or replaces a field.
   *
   * @param field the field.
   */
  public upsertField(field: EngineFieldRow) {
    const state = this.state(field.tableId);
    state.deletedFields.delete(field.id);
    state.fields.set(field.id, field);
  }

  /**
   * Deletes a field; the store removes its cells from every record.
   *
   * @param tableId the table.
   * @param fieldId the field.
   */
  public deleteField(tableId: string, fieldId: string) {
    const state = this.state(tableId);
    state.fields.delete(fieldId);
    state.deletedFields.add(fieldId);
  }

  /**
   * Adds or replaces a view.
   *
   * @param view the view.
   */
  public upsertView(view: EngineViewRow) {
    const state = this.state(view.tableId);
    state.deletedViews.delete(view.id);
    state.views.set(view.id, view);
  }

  /**
   * Deletes a view; the store removes its positions from every record.
   *
   * @param tableId the table.
   * @param viewId the view.
   */
  public deleteView(tableId: string, viewId: string) {
    const state = this.state(tableId);
    state.views.delete(viewId);
    state.deletedViews.add(viewId);
  }

  /**
   * Returns the store mutations of what the batch really changed: cells set
   * to their current value and unchanged rows are left out.
   *
   * @returns one mutation per changed table.
   */
  public mutations(): EngineTableMutation[] {
    const createdAt = this.options.now.toISOString();
    const mutations: EngineTableMutation[] = [];
    for (const [tableId, state] of this.tables) {
      const liveFieldIds = new Set(
        this.fields(tableId).map((field) => field.id)
      );
      const update: EngineRecordUpdate[] = [];
      const history: EngineHistoryRow[] = [];
      const recordIds = new Set([
        ...state.cells.keys(),
        ...state.orders.keys(),
      ]);
      for (const recordId of recordIds) {
        const original = state.records.get(recordId);
        if (!original || state.deleted.has(recordId)) {
          continue;
        }
        const cells: Record<string, DatabaseCellValue> = {};
        for (const [fieldId, value] of state.cells.get(recordId) ?? []) {
          const before = original.cells[fieldId] ?? null;
          if (isEqual(before, value)) {
            continue;
          }
          cells[fieldId] = value;
          if (this.options.history && liveFieldIds.has(fieldId)) {
            history.push({
              id: randomUUID(),
              tableId,
              recordId,
              fieldId,
              before,
              after: value,
              actorId: this.options.actorId,
              createdAt,
            });
          }
        }
        const orders: Record<string, number> = {};
        for (const [viewId, position] of Object.entries(
          state.orders.get(recordId) ?? {}
        )) {
          if (original.orders?.[viewId] !== position) {
            orders[viewId] = position;
          }
        }
        if (Object.keys(cells).length || Object.keys(orders).length) {
          update.push({
            id: recordId,
            ...(Object.keys(cells).length ? { cells } : {}),
            ...(Object.keys(orders).length ? { orders } : {}),
          });
        }
      }

      const insert = [...state.inserted.values()];
      const deleted = [...state.deleted];
      const upsertedFields = [...state.fields.values()].filter(
        (field) =>
          !isEqual(
            field,
            state.snapshot.fields.find((existing) => existing.id === field.id)
          )
      );
      const deletedFields = [...state.deletedFields].filter((id) =>
        state.snapshot.fields.some((field) => field.id === id)
      );
      const upsertedViews = [...state.views.values()].filter(
        (view) =>
          !isEqual(
            view,
            state.snapshot.views.find((existing) => existing.id === view.id)
          )
      );
      const deletedViews = [...state.deletedViews].filter((id) =>
        state.snapshot.views.some((view) => view.id === id)
      );
      const renamed =
        state.name !== undefined && state.name !== state.snapshot.table.name;

      const mutation: EngineTableMutation = { tableId };
      if (renamed) {
        mutation.name = state.name;
      }
      if (insert.length || update.length || deleted.length) {
        mutation.records = {
          ...(insert.length ? { insert } : {}),
          ...(update.length ? { update } : {}),
          ...(deleted.length ? { delete: deleted } : {}),
        };
      }
      if (upsertedFields.length || deletedFields.length) {
        mutation.fields = {
          ...(upsertedFields.length ? { upsert: upsertedFields } : {}),
          ...(deletedFields.length ? { delete: deletedFields } : {}),
        };
      }
      if (upsertedViews.length || deletedViews.length) {
        mutation.views = {
          ...(upsertedViews.length ? { upsert: upsertedViews } : {}),
          ...(deletedViews.length ? { delete: deletedViews } : {}),
        };
      }
      if (history.length) {
        mutation.history = history;
      }
      if (Object.keys(mutation).length > 1) {
        mutations.push(mutation);
      }
    }
    return mutations;
  }

  /**
   * Returns what the batch changed in each table, for the notification.
   *
   * @param mutations the mutations the batch produced.
   * @returns one summary per changed table.
   */
  public static summarize(
    mutations: EngineTableMutation[]
  ): WriteBatchTableSummary[] {
    return mutations.map((mutation) => ({
      tableId: mutation.tableId,
      created: (mutation.records?.insert ?? []).map((record) => record.id),
      updated: (mutation.records?.update ?? []).map((update) => update.id),
      deleted: mutation.records?.delete ?? [],
      fieldIds: [
        ...(mutation.fields?.upsert ?? []).map((field) => field.id),
        ...(mutation.fields?.delete ?? []),
      ],
      viewIds: [
        ...(mutation.views?.upsert ?? []).map((view) => view.id),
        ...(mutation.views?.delete ?? []),
      ],
    }));
  }

  private tables = new Map<string, TableState>();

  private state(tableId: string): TableState {
    const state = this.tables.get(tableId);
    if (!state) {
      throw NotFoundError("Table not found");
    }
    return state;
  }
}

interface TableState {
  snapshot: TableSnapshot;
  records: Map<string, EngineRecordRow>;
  inserted: Map<string, EngineRecordRow>;
  /** Cell changes of existing records; null clears a cell. */
  cells: Map<string, Map<string, DatabaseCellValue>>;
  orders: Map<string, Record<string, number>>;
  deleted: Set<string>;
  fields: Map<string, EngineFieldRow>;
  deletedFields: Set<string>;
  views: Map<string, EngineViewRow>;
  deletedViews: Set<string>;
  name?: string;
}

function mergeRows<T extends { id: string }>(
  original: T[],
  upserted: Map<string, T>,
  deleted: Set<string>
): T[] {
  const rows = original
    .filter((row) => !deleted.has(row.id))
    .map((row) => upserted.get(row.id) ?? row);
  for (const row of upserted.values()) {
    if (!original.some((existing) => existing.id === row.id)) {
      rows.push(row);
    }
  }
  return rows;
}

function isEmptyValue(value: DatabaseCellValue | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

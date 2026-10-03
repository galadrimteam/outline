import { randomUUID } from "node:crypto";
import { chunk, uniq } from "es-toolkit/compat";
import type { Attributes, Transaction } from "sequelize";
import { QueryTypes } from "sequelize";
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
import { NotFoundError } from "@server/errors";
import {
  EngineField,
  EngineRecord,
  EngineRecordHistory,
  EngineTable,
  EngineView,
} from "@server/models";
import { sequelize } from "@server/storage/database";
import { generateEngineId } from "../ids";
import type {
  EngineFieldRow,
  EngineHistoryRow,
  EngineRecordRow,
  EngineRecordUpdate,
  EngineTableMutation,
  EngineTableRow,
  EngineViewRow,
  TableSnapshot,
} from "../types";
import type { OutlineStore } from "./OutlineStore";
import { changesCells } from "./applyMutation";
import { decodeHistoryCursor, encodeHistoryCursor } from "./historyCursor";
import { SnapshotCache } from "./SnapshotCache";

/**
 * The Outline store in Outline's Postgres (tables `engine_*`). Reads are
 * served from a per-process cache, revalidated by one query on the tables'
 * versions, since several Outline processes may write. A write runs in one
 * transaction that locks the tables it touches, and the process that made it
 * patches its cached snapshots with the rows it changed instead of reloading
 * whole tables.
 *
 * Snapshots are shared between readers: they must not be changed.
 */
export class SequelizeOutlineStore implements OutlineStore {
  /**
   * @param cache the snapshots of this process.
   */
  constructor(private readonly cache = new SnapshotCache()) {}

  async table(tableId: string): Promise<TableSnapshot> {
    const [snapshot] = await this.load("id", tableId);
    if (!snapshot) {
      throw NotFoundError("Table not found");
    }
    return snapshot;
  }

  async base(baseId: string): Promise<TableSnapshot[]> {
    return this.load("baseId", baseId);
  }

  async createBase(_teamId: string, _name: string): Promise<string> {
    // A base is the set of tables sharing its id: it exists once a table does.
    return generateEngineId("bse");
  }

  async createTable(input: {
    table: Omit<EngineTableRow, "version">;
    fields: EngineFieldRow[];
    views: EngineViewRow[];
    records?: EngineRecordRow[];
  }): Promise<TableSnapshot> {
    const tableId = input.table.id || generateEngineId("tbl");
    await sequelize.transaction(async (transaction) => {
      await EngineTable.create(
        {
          id: tableId,
          baseId: input.table.baseId,
          teamId: input.table.teamId,
          name: input.table.name,
          version: 1,
        },
        { transaction }
      );
      if (input.fields.length) {
        await EngineField.bulkCreate(
          input.fields.map((field) => fieldAttributes({ ...field, tableId })),
          { transaction }
        );
      }
      if (input.views.length) {
        await EngineView.bulkCreate(
          input.views.map((view) => viewAttributes({ ...view, tableId })),
          { transaction }
        );
      }
      await this.insertRecords(tableId, input.records ?? [], transaction);
    });
    return this.table(tableId);
  }

  async apply(
    mutations: EngineTableMutation[],
    actorId: string | null,
    now: Date
  ): Promise<void> {
    const tableIds = uniq(mutations.map((mutation) => mutation.tableId)).sort();
    if (!tableIds.length) {
      return;
    }

    const refreshed = await sequelize.transaction(async (transaction) => {
      const locked = await sequelize.query<{ id: string }>(
        `SELECT id FROM engine_tables WHERE id IN (:tableIds) ORDER BY id FOR UPDATE`,
        { replacements: { tableIds }, type: QueryTypes.SELECT, transaction }
      );
      if (locked.length !== tableIds.length) {
        throw NotFoundError("Table not found");
      }

      for (const mutation of mutations) {
        await this.applyTableMutation(mutation, actorId, now, transaction);
      }

      const versions = await sequelize.query<{
        id: string;
        version: string | number;
      }>(
        `UPDATE engine_tables SET version = version + 1, "updatedAt" = CAST(:now AS timestamptz)
         WHERE id IN (:tableIds) RETURNING id, version`,
        {
          replacements: { tableIds, now: now.toISOString() },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      const snapshots: TableSnapshot[] = [];
      for (const { id, version } of versions) {
        const snapshot = await this.patchedSnapshot(
          id,
          Number(version),
          mutations.filter((mutation) => mutation.tableId === id),
          transaction
        );
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }
      return snapshots;
    });

    for (const tableId of tableIds) {
      this.cache.delete(tableId);
    }
    for (const snapshot of refreshed) {
      this.cache.set(snapshot);
    }
  }

  async history(
    tableId: string,
    recordId: string,
    cursor?: string,
    limit = 50
  ): Promise<{ entries: EngineHistoryRow[]; nextCursor: string | null }> {
    const after = cursor ? decodeHistoryCursor(cursor) : undefined;
    const rows = await sequelize.query<HistorySqlRow>(
      `SELECT id, "tableId", "recordId", "fieldId", before, after, "actorId", "createdAt"
       FROM engine_record_history
       WHERE "tableId" = :tableId AND "recordId" = :recordId
       ${after ? `AND ("createdAt", id) < (CAST(:createdAt AS timestamptz), :id)` : ""}
       ORDER BY "createdAt" DESC, id DESC
       LIMIT :limit`,
      {
        replacements: {
          tableId,
          recordId,
          createdAt: after?.createdAt ?? null,
          id: after?.id ?? null,
          limit: limit + 1,
        },
        type: QueryTypes.SELECT,
      }
    );
    const entries = rows.slice(0, limit).map(historyRow);
    const last = entries[entries.length - 1];
    return {
      entries,
      nextCursor:
        rows.length > limit && last ? encodeHistoryCursor(last) : null,
    };
  }

  async deleteTable(tableId: string): Promise<void> {
    await EngineTable.destroy({ where: { id: tableId } });
    this.cache.delete(tableId);
  }

  async tableTeamId(tableId: string): Promise<string | null> {
    const table = await EngineTable.findByPk(tableId, {
      attributes: ["teamId"],
    });
    return table?.teamId ?? null;
  }

  private static insertChunk = 1000;

  private static updateChunk = 500;

  /**
   * Returns tables with their data, from the cache when their version has not
   * moved. The versions are read before the data, so that a snapshot is never
   * labelled newer than it is.
   */
  private async load(
    column: "id" | "baseId",
    value: string
  ): Promise<TableSnapshot[]> {
    const tables = (
      await sequelize.query<TableSqlRow>(
        `SELECT id, "baseId", "teamId", name, version FROM engine_tables
         WHERE "${column}" = :value ORDER BY "createdAt", id`,
        { replacements: { value }, type: QueryTypes.SELECT }
      )
    ).map(tableRow);

    const snapshots = new Map<string, TableSnapshot>();
    const stale: EngineTableRow[] = [];
    for (const table of tables) {
      const cached = this.cache.get(table.id, table.version);
      if (cached) {
        snapshots.set(table.id, cached);
      } else {
        stale.push(table);
      }
    }
    for (const snapshot of await this.loadData(stale)) {
      this.cache.set(snapshot);
      snapshots.set(snapshot.table.id, snapshot);
    }
    return tables.flatMap((table) => {
      const snapshot = snapshots.get(table.id);
      return snapshot ? [snapshot] : [];
    });
  }

  private async loadData(tables: EngineTableRow[]): Promise<TableSnapshot[]> {
    if (!tables.length) {
      return [];
    }
    const tableIds = tables.map((table) => table.id);
    const [fields, views, records] = await Promise.all([
      this.loadFields(tableIds),
      this.loadViews(tableIds),
      this.loadRecords(tableIds, undefined),
    ]);
    return tables.map((table) => ({
      table,
      fields: fields.filter((field) => field.tableId === table.id),
      views: views.filter((view) => view.tableId === table.id),
      records: records.filter((record) => record.tableId === table.id),
    }));
  }

  private async loadFields(
    tableIds: string[],
    transaction?: Transaction
  ): Promise<EngineFieldRow[]> {
    const rows = await sequelize.query<FieldSqlRow>(
      `SELECT id, "tableId", name, type, description, options, "lookupOptions", "isPrimary",
              "isComputed", "isLookup", "cellValueType", "isMultipleCellValue", "order"
       FROM engine_fields WHERE "tableId" IN (:tableIds)
       ORDER BY "order", "createdAt", id`,
      { replacements: { tableIds }, type: QueryTypes.SELECT, transaction }
    );
    return rows.map(fieldRow);
  }

  private async loadViews(
    tableIds: string[],
    transaction?: Transaction
  ): Promise<EngineViewRow[]> {
    const rows = await sequelize.query<ViewSqlRow>(
      `SELECT id, "tableId", name, type, "order", description, filter, sort, "group",
              "columnMeta", options, "isLocked"
       FROM engine_views WHERE "tableId" IN (:tableIds)
       ORDER BY "order", "createdAt", id`,
      { replacements: { tableIds }, type: QueryTypes.SELECT, transaction }
    );
    return rows.map(viewRow);
  }

  private async loadRecords(
    tableIds: string[],
    recordIds: string[] | undefined,
    transaction?: Transaction
  ): Promise<EngineRecordRow[]> {
    if (recordIds && !recordIds.length) {
      return [];
    }
    const rows = await sequelize.query<RecordSqlRow>(
      `SELECT id, "tableId", cells, "autoNumber", orders, "createdTime", "lastModifiedTime",
              "createdById", "lastModifiedById"
       FROM engine_records WHERE "tableId" IN (:tableIds)
       ${recordIds ? `AND id IN (:recordIds)` : ""}
       ORDER BY "autoNumber"`,
      {
        replacements: { tableIds, recordIds: recordIds ?? null },
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    return rows.map(recordRow);
  }

  private async applyTableMutation(
    mutation: EngineTableMutation,
    actorId: string | null,
    now: Date,
    transaction: Transaction
  ) {
    const { tableId } = mutation;

    if (mutation.name !== undefined) {
      await EngineTable.update(
        { name: mutation.name },
        { where: { id: tableId }, transaction }
      );
    }

    const upsertedFields = mutation.fields?.upsert ?? [];
    if (upsertedFields.length) {
      await EngineField.bulkCreate(
        upsertedFields.map((field) => fieldAttributes({ ...field, tableId })),
        { updateOnDuplicate: fieldColumns, transaction }
      );
    }
    const deletedFields = mutation.fields?.delete ?? [];
    if (deletedFields.length) {
      await EngineField.destroy({
        where: { tableId, id: deletedFields },
        transaction,
      });
      await sequelize.query(
        `UPDATE engine_records SET cells = cells - ARRAY[:keys]::text[]
         WHERE "tableId" = :tableId AND jsonb_exists_any(cells, ARRAY[:keys]::text[])`,
        { replacements: { tableId, keys: deletedFields }, transaction }
      );
    }

    const upsertedViews = mutation.views?.upsert ?? [];
    if (upsertedViews.length) {
      await EngineView.bulkCreate(
        upsertedViews.map((view) => viewAttributes({ ...view, tableId })),
        { updateOnDuplicate: viewColumns, transaction }
      );
    }
    const deletedViews = mutation.views?.delete ?? [];
    if (deletedViews.length) {
      await EngineView.destroy({
        where: { tableId, id: deletedViews },
        transaction,
      });
      await sequelize.query(
        `UPDATE engine_records SET orders = orders - ARRAY[:keys]::text[]
         WHERE "tableId" = :tableId AND jsonb_exists_any(orders, ARRAY[:keys]::text[])`,
        { replacements: { tableId, keys: deletedViews }, transaction }
      );
    }

    await this.insertRecords(
      tableId,
      mutation.records?.insert ?? [],
      transaction
    );
    await this.updateRecords(
      tableId,
      mutation.records?.update ?? [],
      actorId,
      now,
      transaction
    );

    const deletedRecords = mutation.records?.delete ?? [];
    if (deletedRecords.length) {
      await EngineRecord.destroy({
        where: { tableId, id: deletedRecords },
        transaction,
      });
      await EngineRecordHistory.destroy({
        where: { tableId, recordId: deletedRecords },
        transaction,
      });
    }

    const history = mutation.history ?? [];
    for (const rows of chunk(history, SequelizeOutlineStore.insertChunk)) {
      await EngineRecordHistory.bulkCreate(
        rows.map((row) => ({
          id: row.id || randomUUID(),
          tableId,
          recordId: row.recordId,
          fieldId: row.fieldId,
          before: row.before,
          after: row.after,
          actorId: row.actorId,
          createdAt: new Date(row.createdAt),
        })),
        { transaction }
      );
    }
  }

  /** Inserts records, numbering those whose autoNumber is 0 after the table's last one. */
  private async insertRecords(
    tableId: string,
    records: EngineRecordRow[],
    transaction: Transaction
  ) {
    if (!records.length) {
      return;
    }
    const [{ max }] = await sequelize.query<{ max: number | null }>(
      `SELECT MAX("autoNumber") AS max FROM engine_records WHERE "tableId" = :tableId`,
      { replacements: { tableId }, type: QueryTypes.SELECT, transaction }
    );
    let next = Math.max(
      max ?? 0,
      ...records.map((record) => record.autoNumber)
    );
    const rows = records.map((record) => ({
      id: record.id,
      tableId,
      cells: withoutNulls(record.cells),
      autoNumber: record.autoNumber || ++next,
      orders: record.orders ?? {},
      createdTime: new Date(record.createdTime),
      lastModifiedTime: new Date(record.lastModifiedTime),
      createdById: record.createdBy,
      lastModifiedById: record.lastModifiedBy,
    }));
    for (const part of chunk(rows, SequelizeOutlineStore.insertChunk)) {
      await EngineRecord.bulkCreate(part, { transaction });
    }
  }

  /** Merges cells and positions into records, a chunk of records per statement. */
  private async updateRecords(
    tableId: string,
    updates: EngineRecordUpdate[],
    actorId: string | null,
    now: Date,
    transaction: Transaction
  ) {
    for (const part of chunk(updates, SequelizeOutlineStore.updateChunk)) {
      const rows = part.map((update) => {
        const set: Record<string, DatabaseCellValue> = {};
        const unset = [...(update.unsetFieldIds ?? [])];
        for (const [fieldId, value] of Object.entries(update.cells ?? {})) {
          if (value === null || value === undefined) {
            unset.push(fieldId);
          } else {
            set[fieldId] = value;
          }
        }
        return {
          id: update.id,
          cells_set: set,
          cells_unset: unset,
          orders_set: update.orders ?? {},
          stamp: changesCells(update),
        };
      });
      await sequelize.query(
        `UPDATE engine_records AS r SET
           cells = (r.cells || u.cells_set) - ARRAY(SELECT jsonb_array_elements_text(u.cells_unset)),
           orders = r.orders || u.orders_set,
           "lastModifiedTime" = CASE WHEN u.stamp THEN CAST(:now AS timestamptz) ELSE r."lastModifiedTime" END,
           "lastModifiedById" = CASE WHEN u.stamp THEN CAST(:actorId AS varchar) ELSE r."lastModifiedById" END
         FROM jsonb_to_recordset(CAST(:rows AS jsonb))
           AS u(id text, cells_set jsonb, cells_unset jsonb, orders_set jsonb, stamp boolean)
         WHERE r.id = u.id AND r."tableId" = :tableId`,
        {
          replacements: {
            tableId,
            rows: JSON.stringify(rows),
            now: now.toISOString(),
            actorId,
          },
          transaction,
        }
      );
    }
  }

  /**
   * Builds a table's snapshot after this process's own write from its cached
   * one and the rows the write changed, when the cache held the version just
   * before; otherwise the next read reloads the table.
   */
  private async patchedSnapshot(
    tableId: string,
    version: number,
    mutations: EngineTableMutation[],
    transaction: Transaction
  ): Promise<TableSnapshot | undefined> {
    const cached = this.cache.peek(tableId);
    const tableWide = mutations.some(
      (mutation) =>
        !!mutation.fields?.delete?.length || !!mutation.views?.delete?.length
    );
    if (!cached || cached.table.version !== version - 1 || tableWide) {
      return undefined;
    }

    const changedIds = uniq(
      mutations.flatMap((mutation) => [
        ...(mutation.records?.insert ?? []).map((record) => record.id),
        ...(mutation.records?.update ?? []).map((update) => update.id),
      ])
    );
    const deletedIds = new Set(
      mutations.flatMap((mutation) => mutation.records?.delete ?? [])
    );
    const fieldsChanged = mutations.some((mutation) => !!mutation.fields);
    const viewsChanged = mutations.some((mutation) => !!mutation.views);

    // One connection holds the transaction: its queries run one after the other.
    const changed = await this.loadRecords([tableId], changedIds, transaction);
    const fields = fieldsChanged
      ? await this.loadFields([tableId], transaction)
      : cached.fields;
    const views = viewsChanged
      ? await this.loadViews([tableId], transaction)
      : cached.views;
    const changedById = new Map(changed.map((record) => [record.id, record]));
    const kept = cached.records.flatMap((record) => {
      if (deletedIds.has(record.id)) {
        return [];
      }
      const next = changedById.get(record.id);
      changedById.delete(record.id);
      return [next ?? record];
    });
    const records = [...kept, ...changedById.values()].sort(
      (a, b) => a.autoNumber - b.autoNumber
    );
    const name =
      [...mutations].reverse().find((mutation) => mutation.name !== undefined)
        ?.name ?? cached.table.name;

    return {
      table: { ...cached.table, name, version },
      fields,
      views,
      records,
    };
  }
}

const fieldColumns: (keyof Attributes<EngineField>)[] = [
  "name",
  "type",
  "description",
  "options",
  "lookupOptions",
  "isPrimary",
  "isComputed",
  "isLookup",
  "cellValueType",
  "isMultipleCellValue",
  "order",
  "updatedAt",
];

const viewColumns: (keyof Attributes<EngineView>)[] = [
  "name",
  "type",
  "order",
  "description",
  "filter",
  "sort",
  "group",
  "columnMeta",
  "options",
  "isLocked",
  "updatedAt",
];

interface TableSqlRow {
  id: string;
  baseId: string;
  teamId: string;
  name: string;
  version: string | number;
}

interface FieldSqlRow {
  id: string;
  tableId: string;
  name: string;
  type: DatabaseFieldType;
  description: string | null;
  options: DatabaseFieldOptions | null;
  lookupOptions: DatabaseLookupOptions | null;
  isPrimary: boolean;
  isComputed: boolean;
  isLookup: boolean;
  cellValueType: DatabaseCellValueType;
  isMultipleCellValue: boolean;
  order: number;
}

interface ViewSqlRow {
  id: string;
  tableId: string;
  name: string;
  type: DatabaseEngineViewType;
  order: number;
  description: string | null;
  filter: DatabaseFilter | null;
  sort: DatabaseSort | null;
  group: DatabaseGroup | null;
  columnMeta: Record<string, DatabaseColumnMeta> | null;
  options: DatabaseViewOptions | null;
  isLocked: boolean;
}

interface RecordSqlRow {
  id: string;
  tableId: string;
  cells: Record<string, DatabaseCellValue> | null;
  autoNumber: number;
  orders: Record<string, number> | null;
  createdTime: Date;
  lastModifiedTime: Date;
  createdById: string | null;
  lastModifiedById: string | null;
}

interface HistorySqlRow {
  id: string;
  tableId: string;
  recordId: string;
  fieldId: string;
  before: DatabaseCellValue;
  after: DatabaseCellValue;
  actorId: string | null;
  createdAt: Date;
}

function tableRow(row: TableSqlRow): EngineTableRow {
  return {
    id: row.id,
    baseId: row.baseId,
    teamId: row.teamId,
    name: row.name,
    version: Number(row.version),
  };
}

function fieldRow(row: FieldSqlRow): EngineFieldRow {
  return {
    id: row.id,
    tableId: row.tableId,
    name: row.name,
    type: row.type,
    description: row.description,
    options: row.options ?? {},
    lookupOptions: row.lookupOptions,
    isPrimary: row.isPrimary,
    isComputed: row.isComputed,
    isLookup: row.isLookup,
    cellValueType: row.cellValueType,
    isMultipleCellValue: row.isMultipleCellValue,
    order: Number(row.order),
  };
}

function viewRow(row: ViewSqlRow): EngineViewRow {
  return {
    id: row.id,
    tableId: row.tableId,
    name: row.name,
    type: row.type,
    order: Number(row.order),
    description: row.description,
    filter: row.filter,
    sort: row.sort,
    group: row.group,
    columnMeta: row.columnMeta ?? {},
    options: row.options ?? {},
    isLocked: row.isLocked,
  };
}

function recordRow(row: RecordSqlRow): EngineRecordRow {
  return {
    id: row.id,
    tableId: row.tableId,
    cells: row.cells ?? {},
    autoNumber: row.autoNumber,
    orders: row.orders ?? {},
    createdTime: new Date(row.createdTime).toISOString(),
    lastModifiedTime: new Date(row.lastModifiedTime).toISOString(),
    createdBy: row.createdById,
    lastModifiedBy: row.lastModifiedById,
  };
}

function historyRow(row: HistorySqlRow): EngineHistoryRow {
  return {
    id: row.id,
    tableId: row.tableId,
    recordId: row.recordId,
    fieldId: row.fieldId,
    before: row.before ?? null,
    after: row.after ?? null,
    actorId: row.actorId,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function fieldAttributes(field: EngineFieldRow) {
  return {
    id: field.id,
    tableId: field.tableId,
    name: field.name,
    type: field.type,
    description: field.description ?? null,
    options: field.options ?? {},
    lookupOptions: field.lookupOptions ?? null,
    isPrimary: field.isPrimary,
    isComputed: field.isComputed,
    isLookup: field.isLookup,
    cellValueType: field.cellValueType,
    isMultipleCellValue: field.isMultipleCellValue,
    order: field.order,
  };
}

function viewAttributes(view: EngineViewRow) {
  return {
    id: view.id,
    tableId: view.tableId,
    name: view.name,
    type: view.type,
    order: view.order,
    description: view.description ?? null,
    filter: view.filter ?? null,
    sort: view.sort ?? null,
    group: view.group ?? null,
    columnMeta: view.columnMeta ?? {},
    options: view.options ?? {},
    isLocked: view.isLocked,
  };
}

function withoutNulls(
  cells: Record<string, DatabaseCellValue>
): Record<string, DatabaseCellValue> {
  const result: Record<string, DatabaseCellValue> = {};
  for (const [fieldId, value] of Object.entries(cells ?? {})) {
    if (value !== null && value !== undefined) {
      result[fieldId] = value;
    }
  }
  return result;
}

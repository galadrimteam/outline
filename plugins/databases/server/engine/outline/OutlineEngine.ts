import { uniq } from "es-toolkit/compat";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseRecord,
  DatabaseRecordOrder,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { InternalError, NotFoundError, ValidationError } from "@server/errors";
import type { DatabaseChange } from "../../utils/DatabaseChangePublisher";
import type {
  DatabaseActor,
  DatabaseAggregateQuery,
  DatabaseAggregateValue,
  DatabaseAttachmentUpload,
  DatabaseCreatedTable,
  DatabaseEngine,
  DatabaseEngineUserInput,
  DatabaseFieldConvert,
  DatabaseFieldCreate,
  DatabaseFieldDuplicate,
  DatabaseFieldUpdate,
  DatabaseGroupQuery,
  DatabaseHistoryPage,
  DatabaseLinkCandidate,
  DatabaseLinkCandidateQuery,
  DatabaseRecordMove,
  DatabaseRecordPage,
  DatabaseRecordQuery,
  DatabaseRecordWrite,
  DatabaseRef,
  DatabaseSchema,
  DatabaseTableCreate,
  DatabaseTableInfo,
  DatabaseViewCreate,
  DatabaseViewPosition,
  DatabaseViewUpdate,
} from "../DatabaseEngine";
import type { EngineAttachmentStorage } from "./attachments";
import { CellNormalizer } from "./CellNormalizer";
import { attachmentValues, searchable } from "./cells";
import { ChangeNotifier } from "./ChangeNotifier";
import type { ComputedBaseCache } from "./ComputedBaseCache";
import { FieldBuilder } from "./FieldBuilder";
import { FieldConverter } from "./FieldConverter";
import { generateEngineId } from "./ids";
import {
  holdsSeveral,
  isLinkField,
  linkIds,
  setLinks,
  symmetricFieldOf,
  unlinkRecords,
} from "./links";
import { moveRecordsNextTo, placeNewRecord } from "./positions";
import type { OutlineQuery, QueryContext } from "./query/contract";
import { RecordPresenter } from "./RecordPresenter";
import {
  isReadOnlyField,
  toDatabaseField,
  toDatabaseView,
  uniqueName,
} from "./schema";
import type { OutlineStore } from "./store/OutlineStore";
import type { ReadState } from "./TableReader";
import { TableReader } from "./TableReader";
import type { EngineFieldRow, EngineRecordRow, TableSnapshot } from "./types";
import type { EngineUserDirectory } from "./users";
import { engineUserId } from "./users";
import {
  duplicateView,
  existingView,
  firstView,
  newView,
  patchedView,
  reorderViews,
  sortedViews,
} from "./views";
import { WriteBatch } from "./WriteBatch";

/** What the Outline engine is built with. */
export interface OutlineEngineOptions {
  /** Where the tables are kept. */
  store: OutlineStore;
  /** Computes, filters, sorts and converts cells. */
  query: OutlineQuery;
  /** Names the people of person cells and history. */
  users: EngineUserDirectory;
  /** Keeps the files of attachment cells. */
  attachments: EngineAttachmentStorage;
  /** Tells the readers of a table that it changed. */
  publish: (change: DatabaseChange) => Promise<void>;
  /** The computed bases of the process, shared by every engine instance. */
  computedBases: ComputedBaseCache;
  /** The team of the database: required to create bases and resolve people. */
  teamId?: string;
  /** Echoed by the change notifications, so that a writer knows its own changes. */
  origin?: string | null;
  /** Time zone of dates and date filters that carry none; Europe/Paris by default. */
  timeZone?: string;
}

/** When and by whom a write is made. */
interface WriteContext {
  now: Date;
  actorId: string | null;
}

/**
 * The database engine that keeps data in Outline's own Postgres. It speaks
 * Teable's vocabulary (ids, field types, filters, view options), so that the
 * routes, the app and a table moved from Teable see no difference. Reads
 * compute the cells of the table's base with `OutlineQuery` (cached per
 * table versions); writes are gathered in a `WriteBatch` over the tables as
 * they are, stored in one transaction, then told to the readers of every
 * table they changed.
 */
export class OutlineEngine implements DatabaseEngine {
  /**
   * @param options the store, the query functions and the collaborators.
   */
  constructor(private readonly options: OutlineEngineOptions) {
    const timeZone = options.timeZone ?? OutlineEngine.defaultTimeZone;
    this.timeZone = timeZone;
    this.reader = new TableReader({
      store: options.store,
      query: options.query,
      computedBases: options.computedBases,
      teamId: options.teamId,
      timeZone,
    });
    this.cells = new CellNormalizer(options.query, options.users);
    this.presenter = new RecordPresenter(options.query, options.users);
    this.notifier = new ChangeNotifier(options.publish, options.origin ?? null);
    this.fields = new FieldBuilder(options.query);
    this.converter = new FieldConverter(options.query, this.fields);
  }

  async getSchema(
    _actor: DatabaseActor,
    ref: DatabaseRef
  ): Promise<DatabaseSchema> {
    const table = await this.reader.table(ref);
    return {
      fields: table.fields.map(toDatabaseField),
      views: sortedViews(table.views).map(toDatabaseView),
    };
  }

  async describeTable(
    _actor: DatabaseActor,
    ref: DatabaseRef
  ): Promise<DatabaseTableInfo> {
    const table = await this.reader.table(ref);
    return { name: table.table.name };
  }

  async listRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseRecordQuery
  ): Promise<DatabaseRecordPage> {
    const state = await this.reader.read(ref);
    const selected = this.options.query.select(
      state.table,
      state.computed,
      {
        view: query.viewId ? viewOf(state.table, query.viewId) : undefined,
        filter: query.filter,
        replaceFilter: query.replaceFilter,
        sort: query.sort,
        search: query.search,
      },
      this.context(actor)
    );
    return {
      records: await this.presenter.records(
        state,
        selected.slice(query.skip, query.skip + query.take)
      ),
      total: selected.length,
    };
  }

  async getRecord(
    _actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string
  ): Promise<DatabaseRecord> {
    return this.presenter.record(await this.reader.read(ref), recordId);
  }

  async createRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord> {
    const { result: recordId, state } = await this.write(
      actor,
      ref,
      async (batch, before, context) => {
        const tableId = before.table.table.id;
        const cells = {
          ...this.cells.defaults(before.table.fields, actor, context.now),
          ...(await this.cells.normalize(before.table, input.fields)),
        };
        const id = insertRecord(batch, tableId, context);
        writeCells(batch, tableId, id, cells);
        placeNewRecord(batch, tableId, id, input.order, this.between);
        return id;
      }
    );
    return this.presenter.record(state, recordId);
  }

  async updateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord> {
    const { state } = await this.write(actor, ref, async (batch, before) => {
      const tableId = before.table.table.id;
      existingRecord(batch, tableId, recordId);
      const cells = await this.cells.normalize(before.table, input.fields);
      writeCells(batch, tableId, recordId, cells);
      if (input.order) {
        moveRecordsNextTo(
          batch,
          tableId,
          [recordId],
          input.order,
          this.between
        );
      }
    });
    return this.presenter.record(state, recordId);
  }

  async moveRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordMove
  ): Promise<DatabaseRecord[]> {
    const { state } = await this.write(actor, ref, async (batch, before) => {
      const tableId = before.table.table.id;
      existingView(batch, tableId, input.viewId);
      for (const id of input.recordIds) {
        existingRecord(batch, tableId, id);
      }
      if (input.fields && Object.keys(input.fields).length) {
        const cells = await this.cells.normalize(before.table, input.fields);
        for (const id of input.recordIds) {
          writeCells(batch, tableId, id, cells);
        }
      }
      if (input.anchorId) {
        moveRecordsNextTo(
          batch,
          tableId,
          input.recordIds,
          {
            viewId: input.viewId,
            anchorId: input.anchorId,
            position: input.position ?? "before",
          },
          this.between
        );
      }
    });
    return this.presenter.records(
      state,
      input.recordIds.flatMap((id) => {
        const record = state.computed.record(state.table.table.id, id);
        return record ? [record] : [];
      })
    );
  }

  async deleteRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordIds: string[]
  ): Promise<void> {
    await this.write(actor, ref, (batch, before) => {
      const tableId = before.table.table.id;
      const existing = uniq(recordIds).filter(
        (id) => !!batch.record(tableId, id)
      );
      batch.deleteRecords(tableId, existing);
      unlinkRecords(batch, tableId, existing);
    });
  }

  async duplicateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    order?: DatabaseRecordOrder
  ): Promise<DatabaseRecord> {
    const { result: copyId, state } = await this.write(
      actor,
      ref,
      (batch, before, context) => {
        const tableId = before.table.table.id;
        const source = existingRecord(batch, tableId, recordId);
        const id = insertRecord(batch, tableId, context);
        for (const field of batch.fields(tableId)) {
          const value = source.cells[field.id];
          if (isReadOnlyField(field) || value === undefined || value === null) {
            continue;
          }
          if (!isLinkField(field)) {
            batch.setCell(tableId, id, field.id, structuredClone(value));
            continue;
          }
          // A record the other side links once only stays with the original.
          const symmetric = symmetricFieldOf(batch, field);
          if (!symmetric || holdsSeveral(symmetric)) {
            setLinks(batch, tableId, id, field, linkIds(value));
          }
        }
        placeNewRecord(batch, tableId, id, order, this.between);
        return id;
      }
    );
    return this.presenter.record(state, copyId);
  }

  async groupPoints(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseGroupQuery
  ): Promise<DatabaseGroupPoint[]> {
    const state = await this.reader.read(ref);
    const view = viewOf(state.table, query.viewId);
    const group = query.groupBy ?? view.group;
    if (!group?.length) {
      return [];
    }
    const selected = this.options.query.select(
      state.table,
      state.computed,
      { view: { ...view, group }, filter: query.filter, search: query.search },
      this.context(actor)
    );
    return this.presenter.groupPoints(
      state,
      group,
      this.options.query.groupPoints(state.table, selected, group)
    );
  }

  async aggregate(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseAggregateQuery
  ): Promise<Record<string, DatabaseAggregateValue>> {
    const state = await this.reader.read(ref);
    const view = viewOf(state.table, query.viewId);
    const selected = this.options.query.select(
      state.table,
      state.computed,
      { view, filter: query.filter, search: query.search },
      this.context(actor)
    );
    const totals: Record<string, DatabaseAggregateValue> =
      this.options.query.aggregate(state.table, selected, query.fieldStats);
    if (!query.byGroup || !view.group?.length) {
      return totals;
    }
    const members = this.options.query.groupMembers(
      state.table,
      selected,
      view.group
    );
    for (const [groupId, records] of members) {
      const values = this.options.query.aggregate(
        state.table,
        records,
        query.fieldStats
      );
      for (const [fieldId, result] of Object.entries(values)) {
        const total = totals[fieldId];
        if (total) {
          total.groups = { ...total.groups, [groupId]: result.value };
        }
      }
    }
    return totals;
  }

  async linkCandidates(
    _actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseLinkCandidateQuery
  ): Promise<DatabaseLinkCandidate[]> {
    const state = await this.reader.read(ref);
    const field = state.table.fields.find((item) => item.id === query.fieldId);
    const foreignTableId = field?.options.foreignTableId;
    const foreign = state.tables.find(
      (snapshot) => snapshot.table.id === foreignTableId
    );
    if (!field || !isLinkField(field) || !foreignTableId || !foreign) {
      throw ValidationError("The field is not a link to another table");
    }
    const titleField =
      foreign.fields.find((item) => item.id === field.options.lookupFieldId) ??
      foreign.fields.find((item) => item.isPrimary);

    // A record of a oneMany or oneOne link belongs to one record at most.
    const taken = new Set<string>();
    if (
      field.options.relationship === "oneMany" ||
      field.options.relationship === "oneOne"
    ) {
      for (const record of state.table.records) {
        if (record.id !== query.recordId) {
          for (const id of linkIds(record.cells[field.id])) {
            taken.add(id);
          }
        }
      }
    }

    const search = query.search ? searchable(query.search) : "";
    const candidates: DatabaseLinkCandidate[] = [];
    for (const record of state.computed.records(foreignTableId)) {
      if (taken.has(record.row.id)) {
        continue;
      }
      const title = titleField
        ? this.options.query.cellText(
            record.cells[titleField.id] ?? null,
            toDatabaseField(titleField)
          )
        : "";
      if (!search || searchable(title).includes(search)) {
        candidates.push({ id: record.row.id, title });
      }
    }
    return candidates.slice(query.skip, query.skip + query.take);
  }

  async recordHistory(
    _actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    cursor?: string
  ): Promise<DatabaseHistoryPage> {
    const state = await this.reader.read(ref);
    const page = await this.options.store.history(
      state.table.table.id,
      recordId,
      cursor
    );
    return {
      entries: await this.presenter.history(state, page.entries),
      nextCursor: page.nextCursor,
    };
  }

  async uploadAttachment(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseAttachmentUpload
  ): Promise<DatabaseRecord> {
    if (actor === "system") {
      throw ValidationError("Files are uploaded by a person");
    }
    const table = await this.reader.table(ref);
    const field = table.fields.find((item) => item.id === input.fieldId);
    if (
      !field ||
      field.type !== DatabaseFieldType.Attachment ||
      isReadOnlyField(field)
    ) {
      throw ValidationError("The field does not hold files");
    }
    if (!table.records.some((record) => record.id === input.recordId)) {
      throw NotFoundError("Record not found");
    }
    const attachment = await this.options.attachments.store({
      teamId: table.table.teamId,
      userId: actor.outlineUserId,
      filePath: input.filePath,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
    const { state } = await this.write(actor, ref, (batch, before) => {
      const tableId = before.table.table.id;
      existingRecord(batch, tableId, input.recordId);
      batch.setCell(tableId, input.recordId, field.id, [
        ...attachmentValues(batch.cell(tableId, input.recordId, field.id)),
        attachment,
      ]);
    });
    return this.presenter.record(state, input.recordId);
  }

  async createField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseFieldCreate
  ): Promise<DatabaseField> {
    const { result } = await this.write(
      actor,
      ref,
      async (batch, before) => {
        const tableId = before.table.table.id;
        const { foreignDatabaseId: _database, ...options } =
          input.options ?? {};
        const draft = {
          id: generateEngineId("fld"),
          tableId,
          name: uniqueName(
            input.name.trim(),
            batch.fields(tableId).map((field) => field.name)
          ),
          type: input.type,
          description: null,
          options,
          lookupOptions: input.lookupOptions ?? null,
          isPrimary: false,
          isLookup: input.isLookup ?? false,
          order: this.fields.nextOrder(batch, tableId),
        };
        let field: EngineFieldRow;
        if (input.type === DatabaseFieldType.Link) {
          await this.reader.addLinkedTable(
            batch,
            before.table,
            options.foreignTableId
          );
          field = this.fields.link(batch, draft);
        } else {
          field = this.fields.field(batch, draft);
        }
        batch.upsertField(field);
        this.fields.addColumn(batch, tableId, field.id, input.viewId);
        return field;
      },
      { history: false }
    );
    return toDatabaseField(result);
  }

  async updateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldUpdate
  ): Promise<DatabaseField> {
    const { result } = await this.write(
      actor,
      ref,
      (batch, before) => {
        const tableId = before.table.table.id;
        const field = existingField(batch, tableId, fieldId);
        const name = input.name?.trim();
        if (
          name &&
          batch
            .fields(tableId)
            .some((item) => item.id !== fieldId && item.name === name)
        ) {
          throw ValidationError("A field with this name already exists");
        }
        const updated: EngineFieldRow = {
          ...field,
          name: name || field.name,
          description:
            input.description !== undefined
              ? input.description
              : field.description,
        };
        batch.upsertField(updated);
        return updated;
      },
      { history: false }
    );
    return toDatabaseField(result);
  }

  async convertField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldConvert
  ): Promise<DatabaseField> {
    const { result } = await this.write(
      actor,
      ref,
      async (batch, before) => {
        if (
          input.type === DatabaseFieldType.Link &&
          input.options?.foreignTableId
        ) {
          await this.reader.addLinkedTable(
            batch,
            before.table,
            input.options.foreignTableId
          );
        }
        return this.converter.convert(
          batch,
          before.computed,
          before.table.table.id,
          fieldId,
          input
        );
      },
      { history: false }
    );
    return toDatabaseField(result);
  }

  async duplicateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldDuplicate
  ): Promise<DatabaseField> {
    const { result } = await this.write(
      actor,
      ref,
      (batch, before) => {
        const tableId = before.table.table.id;
        const source = existingField(batch, tableId, fieldId);
        const draft = {
          ...source,
          id: generateEngineId("fld"),
          name: uniqueName(
            (input.name ?? source.name).trim(),
            batch.fields(tableId).map((field) => field.name)
          ),
          isPrimary: false,
          order: this.fields.nextOrder(batch, tableId),
        };
        const field = isLinkField(source)
          ? this.fields.link(batch, {
              ...draft,
              options: { ...source.options, symmetricFieldId: undefined },
            })
          : this.fields.field(batch, draft);
        batch.upsertField(field);
        this.fields.addColumnAfter(
          batch,
          tableId,
          source.id,
          field.id,
          input.viewId
        );

        if (!isReadOnlyField(source)) {
          for (const record of batch.records(tableId)) {
            const value = record.cells[source.id];
            if (value === undefined || value === null) {
              continue;
            }
            if (isLinkField(field)) {
              setLinks(batch, tableId, record.id, field, linkIds(value));
            } else {
              batch.setCell(
                tableId,
                record.id,
                field.id,
                structuredClone(value)
              );
            }
          }
        }
        return field;
      },
      { history: false }
    );
    return toDatabaseField(result);
  }

  async deleteField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string
  ): Promise<void> {
    await this.write(
      actor,
      ref,
      (batch, before) => {
        const tableId = before.table.table.id;
        const field = existingField(batch, tableId, fieldId);
        if (field.isPrimary) {
          throw ValidationError("The primary field cannot be deleted");
        }
        const symmetric = isLinkField(field)
          ? symmetricFieldOf(batch, field)
          : undefined;
        batch.deleteField(tableId, fieldId);
        this.fields.removeFromViews(batch, tableId, [fieldId]);
        if (symmetric) {
          batch.deleteField(symmetric.tableId, symmetric.id);
          this.fields.removeFromViews(batch, symmetric.tableId, [symmetric.id]);
        }
      },
      { history: false }
    );
  }

  async createView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseViewCreate
  ): Promise<DatabaseView> {
    const { result } = await this.write(actor, ref, (batch, before) => {
      const view = newView(batch, before.table.table.id, input);
      batch.upsertView(view);
      return view;
    });
    return toDatabaseView(result);
  }

  async updateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    input: DatabaseViewUpdate
  ): Promise<DatabaseView> {
    const { result } = await this.write(actor, ref, (batch, before) => {
      const view = patchedView(
        existingView(batch, before.table.table.id, viewId),
        input
      );
      batch.upsertView(view);
      return view;
    });
    return toDatabaseView(result);
  }

  async deleteView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<void> {
    await this.write(actor, ref, (batch, before) => {
      const tableId = before.table.table.id;
      existingView(batch, tableId, viewId);
      if (batch.views(tableId).length <= 1) {
        throw ValidationError("The last view of a database cannot be deleted");
      }
      batch.deleteView(tableId, viewId);
    });
  }

  async duplicateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<DatabaseView> {
    const { result } = await this.write(actor, ref, (batch, before) =>
      duplicateView(batch, before.table.table.id, viewId)
    );
    return toDatabaseView(result);
  }

  async reorderView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    position: DatabaseViewPosition
  ): Promise<DatabaseView[]> {
    const { state } = await this.write(actor, ref, (batch, before) =>
      reorderViews(batch, before.table.table.id, viewId, position)
    );
    return sortedViews(state.table.views).map(toDatabaseView);
  }

  async createBase(name: string): Promise<string> {
    return this.options.store.createBase(this.teamId(), name);
  }

  async createTable(
    actor: DatabaseActor,
    externalBaseId: string,
    input: DatabaseTableCreate
  ): Promise<DatabaseCreatedTable> {
    const base = await this.options.store.base(externalBaseId);
    const teamId = this.options.teamId ?? base[0]?.table.teamId;
    if (!teamId) {
      throw InternalError("The Outline engine needs the team of the database");
    }
    if (base.some((snapshot) => snapshot.table.teamId !== teamId)) {
      throw NotFoundError("Base not found");
    }
    if (input.fields.some((field) => field.type === DatabaseFieldType.Link)) {
      throw ValidationError("A relation is added once the table exists");
    }

    const tableId = generateEngineId("tbl");
    const fieldIds: Record<string, string> = {};
    const table = {
      id: tableId,
      baseId: externalBaseId,
      teamId,
      name: input.name,
    };
    const batch = new WriteBatch(
      [
        { table: { ...table, version: 0 }, fields: [], views: [], records: [] },
        ...base,
      ],
      { actorId: engineUserId(actor), now: new Date(), history: false }
    );
    input.fields.forEach((field, index) => {
      fieldIds[field.key] = generateEngineId("fld");
      batch.upsertField(
        this.fields.field(batch, {
          id: fieldIds[field.key],
          tableId,
          name: uniqueName(
            field.name,
            batch.fields(tableId).map((item) => item.name)
          ),
          type: field.type,
          description: null,
          options: field.options ?? {},
          lookupOptions: null,
          isPrimary: index === 0,
          isLookup: false,
          order: index,
        })
      );
    });
    const fields = batch.fields(tableId);
    const created = await this.options.store.createTable({
      table,
      fields,
      views: [firstView(tableId, input, fieldIds, fields)],
    });
    return {
      externalTableId: created.table.id,
      fieldIds,
      fields: created.fields.map(toDatabaseField),
      views: sortedViews(created.views).map(toDatabaseView),
    };
  }

  ensureUsers(users: DatabaseEngineUserInput[]): Promise<Map<string, string>> {
    return this.options.users.ensureUsers(this.teamId(), users);
  }

  private static defaultTimeZone = "Europe/Paris";

  private readonly timeZone: string;

  private readonly reader: TableReader;

  private readonly cells: CellNormalizer;

  private readonly presenter: RecordPresenter;

  private readonly notifier: ChangeNotifier;

  private readonly fields: FieldBuilder;

  private readonly converter: FieldConverter;

  private readonly between = (
    low: number | undefined,
    high: number | undefined,
    count: number
  ) => this.options.query.positionsBetween(low, high, count);

  private teamId(): string {
    if (!this.options.teamId) {
      throw InternalError("The Outline engine needs the team of the database");
    }
    return this.options.teamId;
  }

  private context(actor: DatabaseActor): QueryContext {
    return {
      now: new Date(),
      userId: engineUserId(actor) ?? undefined,
      timeZone: this.timeZone,
    };
  }

  /**
   * Runs a write: builds it over the tables as they are, stores what really
   * changed in one transaction, reads the tables again and tells their
   * readers.
   */
  private async write<T>(
    actor: DatabaseActor,
    ref: DatabaseRef,
    build: (
      batch: WriteBatch,
      before: ReadState,
      context: WriteContext
    ) => Promise<T> | T,
    options: { history?: boolean } = {}
  ): Promise<{ result: T; state: ReadState }> {
    const before = await this.reader.read(ref);
    const context: WriteContext = {
      now: new Date(),
      actorId: engineUserId(actor),
    };
    const batch = new WriteBatch(before.tables, {
      actorId: context.actorId,
      now: context.now,
      history: options.history ?? true,
    });
    const result = await build(batch, before, context);
    const mutations = batch.mutations();
    if (!mutations.length) {
      return { result, state: before };
    }
    await this.options.store.apply(mutations, context.actorId, context.now);
    const after = await this.reader.read(ref);
    await this.notifier.notify(
      actor,
      before,
      after,
      WriteBatch.summarize(mutations)
    );
    return { result, state: after };
  }
}

function viewOf(table: TableSnapshot, viewId: string) {
  const view = table.views.find((item) => item.id === viewId);
  if (!view) {
    throw NotFoundError("View not found");
  }
  return view;
}

function existingRecord(
  batch: WriteBatch,
  tableId: string,
  recordId: string
): EngineRecordRow {
  const record = batch.record(tableId, recordId);
  if (!record) {
    throw NotFoundError("Record not found");
  }
  return record;
}

function existingField(
  batch: WriteBatch,
  tableId: string,
  fieldId: string
): EngineFieldRow {
  const field = batch.field(tableId, fieldId);
  if (!field) {
    throw NotFoundError("Field not found");
  }
  return field;
}

/** Adds an empty record, stamped with its creation. */
function insertRecord(
  batch: WriteBatch,
  tableId: string,
  context: WriteContext
): string {
  const id = generateEngineId("rec");
  const stamp = context.now.toISOString();
  batch.insertRecord({
    id,
    tableId,
    cells: {},
    autoNumber: 0,
    orders: {},
    createdTime: stamp,
    lastModifiedTime: stamp,
    createdBy: context.actorId,
    lastModifiedBy: context.actorId,
  });
  return id;
}

/** Writes normalized cells into a record, links kept in step on both sides. */
function writeCells(
  batch: WriteBatch,
  tableId: string,
  recordId: string,
  cells: Record<string, DatabaseCellValue>
) {
  for (const [fieldId, value] of Object.entries(cells)) {
    const field = batch.field(tableId, fieldId);
    if (!field) {
      continue;
    }
    if (isLinkField(field)) {
      setLinks(batch, tableId, recordId, field, linkIds(value));
    } else {
      batch.setCell(tableId, recordId, fieldId, value);
    }
  }
}

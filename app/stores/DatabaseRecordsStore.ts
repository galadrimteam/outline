import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  runInAction,
} from "mobx";
import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseChangeEvent,
  DatabaseFilter,
  DatabaseFilterItem,
  DatabaseGroup,
  DatabaseGroupPoint,
  DatabaseHistoryEntry,
  DatabaseRecord,
  DatabaseRecordOrder,
  DatabaseRecordPosition,
  DatabaseSort,
  DatabaseStatisticFunc,
  DatabaseUserInput,
  DatabaseUserValue,
} from "@shared/databases/types";
import type Document from "~/models/Document";
import type { PartialExcept } from "~/types";
import Logger from "~/utils/Logger";
import { databaseRpc, tabOrigin } from "./DatabasesStore";
import type RootStore from "./RootStore";

/** What narrows the rows of a view for one reader, on top of the view's own settings. */
export interface RecordQueryParams {
  /** The reader's temporary filter, ANDed with the view's unless `replaceFilter`. */
  filter?: DatabaseFilter | null;
  /** The filter replaces the view's (honoured for people who can edit the database). */
  replaceFilter?: boolean;
  /** The reader's temporary sort, replacing the view's. */
  sort?: DatabaseSort | null;
  search?: string;
  /** ANDed with everything else, eg one board column. */
  extraFilter?: DatabaseFilter | null;
  /** Rows per page, 100 by default, at most 200. */
  pageSize?: number;
}

export interface RecordMoveParams {
  recordIds: string[];
  anchorId?: string;
  position?: DatabaseRecordPosition;
  /** Written before the order, eg the new column of a board card. */
  fields?: Record<string, DatabaseCellInput>;
}

export interface RecordSearchParams {
  filter?: DatabaseFilter | null;
  search?: string;
}

export interface LinkCandidate {
  id: string;
  title: string;
}

/**
 * Tells whether a row passes a filter, for the operators a board column or a
 * quick filter uses. Anything else cannot be decided without the engine.
 *
 * @param filter the filter.
 * @param record the row.
 * @returns true or false when decidable, undefined otherwise.
 */
export function evaluateFilter(
  filter: DatabaseFilter | null | undefined,
  record: DatabaseRecord
): boolean | undefined {
  if (!filter || filter.filterSet.length === 0) {
    return true;
  }

  const results = filter.filterSet.map((item) =>
    "filterSet" in item
      ? evaluateFilter(item, record)
      : evaluateFilterItem(item, record)
  );

  if (filter.conjunction === "and") {
    if (results.includes(false)) {
      return false;
    }
    return results.includes(undefined) ? undefined : true;
  }

  if (results.includes(true)) {
    return true;
  }
  return results.includes(undefined) ? undefined : false;
}

/**
 * Tells whether a cell value is empty the way the engine means it.
 *
 * @param value the cell value.
 * @returns true for null, undefined, "", false-less empty arrays.
 */
export function isEmptyCell(value: DatabaseCellValue | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Turns what the app writes into what a row holds, so that a write can be
 * shown before the server answers. People are resolved from the users store.
 *
 * @param input the written value.
 * @param resolveUser returns a person's name and avatar.
 * @returns the value to show.
 */
export function toOptimisticValue(
  input: DatabaseCellInput,
  resolveUser: (id: string) => { name: string; avatarUrl?: string | null }
): DatabaseCellValue {
  const toUser = (user: DatabaseUserInput): DatabaseUserValue => {
    const resolved = resolveUser(user.outlineUserId);
    return {
      id: user.outlineUserId,
      title: resolved.name,
      avatarUrl: resolved.avatarUrl ?? null,
      outlineUserId: user.outlineUserId,
    };
  };

  if (isUserInputList(input)) {
    return input.map(toUser);
  }
  if (isUserInput(input)) {
    return toUser(input);
  }
  return input;
}

/**
 * Inserts ids next to an anchor, or at the end without one.
 *
 * @param ids the current ids.
 * @param inserted the ids to insert, in order.
 * @param anchorId the id they go next to.
 * @param position which side of the anchor.
 * @returns the new ids.
 */
export function insertIds(
  ids: string[],
  inserted: string[],
  anchorId?: string,
  position: DatabaseRecordPosition = "after"
): string[] {
  const rest = ids.filter((id) => !inserted.includes(id));
  const anchorIndex = anchorId ? rest.indexOf(anchorId) : -1;
  if (anchorIndex === -1) {
    return [...rest, ...inserted];
  }
  const at = position === "before" ? anchorIndex : anchorIndex + 1;
  return [...rest.slice(0, at), ...inserted, ...rest.slice(at)];
}

/**
 * The rows of one view for one set of reader parameters, loaded page by page.
 * Rows themselves live in the store, so a write shows in every query at once.
 */
export class RecordQuery {
  /** The ids of the loaded rows, in view order. */
  @observable.ref
  recordIds: string[] = [];

  /** How many rows match on the server. */
  @observable
  total = 0;

  @observable
  isLoading = false;

  @observable
  isLoaded = false;

  @observable.ref
  error: Error | undefined = undefined;

  readonly key: string;

  readonly databaseId: string;

  readonly viewId: string;

  readonly params: RecordQueryParams;

  constructor(
    store: DatabaseRecordsStore,
    databaseId: string,
    viewId: string,
    params: RecordQueryParams,
    key: string
  ) {
    this.store = store;
    this.databaseId = databaseId;
    this.viewId = viewId;
    this.params = params;
    this.key = key;
    makeObservable(this);

    onBecomeObserved(this, "recordIds", () => {
      this.observed = true;
      if (this.isStale) {
        this.scheduleRefresh();
      }
    });
    onBecomeUnobserved(this, "recordIds", () => {
      this.observed = false;
    });
  }

  /** The loaded rows, in view order. */
  @computed
  get records(): DatabaseRecord[] {
    const records: DatabaseRecord[] = [];
    for (const id of this.recordIds) {
      const record = this.store.recordById(this.databaseId, id);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  /** Whether more rows can be loaded. */
  @computed
  get hasMore(): boolean {
    return this.isLoaded && this.recordIds.length < this.total;
  }

  /** The number of rows asked for per page. */
  get pageSize(): number {
    return Math.min(Math.max(this.params.pageSize ?? 100, 1), 200);
  }

  /**
   * Loads the first page, unless it is loaded and up to date.
   *
   * @returns a promise resolved once loaded.
   */
  fetch = async (): Promise<void> => {
    if ((this.isLoaded || this.isLoading) && !this.isStale) {
      return this.inflight;
    }
    return this.refresh();
  };

  /**
   * Loads the next page.
   *
   * @returns a promise resolved once loaded.
   */
  loadMore = async (): Promise<void> => {
    if (this.isLoading || !this.hasMore) {
      return;
    }

    const generation = this.generation;
    runInAction(() => {
      this.isLoading = true;
    });

    try {
      const { records, total } = await this.request(
        this.recordIds.length,
        this.pageSize
      );
      if (generation !== this.generation) {
        return;
      }
      runInAction(() => {
        this.store.cacheRecords(this.databaseId, records);
        const known = new Set(this.recordIds);
        this.recordIds = [
          ...this.recordIds,
          ...records.map((record) => record.id).filter((id) => !known.has(id)),
        ];
        this.total = total;
        this.error = undefined;
      });
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err : new Error(String(err));
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  };

  /**
   * Reloads every loaded row at once, keeping as many rows as are shown. Waits
   * for the database's writes in flight so that it never shows a state older
   * than an optimistic one.
   *
   * @returns a promise resolved once reloaded.
   */
  refresh = (): Promise<void> => {
    const promise = this.load();
    this.inflight = promise;
    return promise;
  };

  /**
   * Marks the rows as outdated: reloaded soon when shown, else on next fetch.
   */
  invalidate = () => {
    this.isStale = true;
    if (this.observed) {
      this.scheduleRefresh();
    }
  };

  /**
   * Computes statistics over all the rows of the query, loaded or not.
   *
   * @param fieldStats the function per field.
   * @returns the value per field.
   */
  aggregate = (
    fieldStats: Record<string, DatabaseStatisticFunc>
  ): Promise<Record<string, { value: number | string | null }>> =>
    this.store.aggregate(this.databaseId, this.viewId, fieldStats, {
      filter: combineFilters(this.params.filter, this.params.extraFilter),
      search: this.params.search || undefined,
    });

  /**
   * Applies a change made here to the loaded rows, without asking the server.
   *
   * @param recordIds the new row ids.
   * @param total the new count.
   */
  @action
  setLocal(recordIds: string[], total: number) {
    this.recordIds = recordIds;
    this.total = Math.max(total, recordIds.length);
  }

  private store: DatabaseRecordsStore;

  private generation = 0;

  private observed = false;

  private isStale = false;

  private inflight: Promise<void> | undefined;

  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  private scheduleRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, 250);
  }

  private async load(attempt = 0): Promise<void> {
    const generation = ++this.generation;
    this.isStale = false;
    runInAction(() => {
      this.isLoading = true;
    });

    try {
      await this.store.whenIdle(this.databaseId);
      const writes = this.store.writeCount(this.databaseId);
      const wanted = Math.max(this.recordIds.length, this.pageSize);
      const records: DatabaseRecord[] = [];
      let total = 0;

      while (records.length < wanted) {
        const limit = Math.min(200, wanted - records.length);
        const page = await this.request(records.length, limit);
        records.push(...page.records);
        total = page.total;
        if (page.records.length < limit) {
          break;
        }
      }

      if (generation !== this.generation) {
        return;
      }
      if (this.store.writeCount(this.databaseId) !== writes && attempt < 3) {
        return await this.load(attempt + 1);
      }

      runInAction(() => {
        this.store.cacheRecords(this.databaseId, records);
        this.recordIds = records.map((record) => record.id);
        this.total = total;
        this.isLoaded = true;
        this.error = undefined;
      });
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      runInAction(() => {
        this.error = err instanceof Error ? err : new Error(String(err));
      });
    } finally {
      if (generation === this.generation) {
        runInAction(() => {
          this.isLoading = false;
        });
      }
    }
  }

  private async request(offset: number, limit: number) {
    const res = await databaseRpc<DatabaseRecord[]>("/databaseRecords.list", {
      databaseId: this.databaseId,
      viewId: this.viewId,
      filter: combineFilters(this.params.filter, this.params.extraFilter),
      replaceFilter: this.params.replaceFilter || undefined,
      sort: this.params.sort ?? undefined,
      search: this.params.search || undefined,
      offset,
      limit,
    });
    const total = Number(res.pagination?.total ?? res.data.length);
    return { records: res.data, total };
  }
}

/**
 * The rows of the databases on screen, and every write to them. Writes show at
 * once in every loaded view and are undone when the server refuses them.
 */
export default class DatabaseRecordsStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeObservable(this);
  }

  /**
   * Returns the query for a view and a reader's parameters, the same instance
   * for the same arguments. Nothing is loaded until `fetch` is called.
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   * @param params the reader's filter, sort, search and extra filter.
   * @returns the query.
   */
  query(
    databaseId: string,
    viewId: string,
    params: RecordQueryParams = {}
  ): RecordQuery {
    const key = [
      databaseId,
      viewId,
      JSON.stringify([
        params.filter ?? null,
        params.replaceFilter ?? false,
        params.sort ?? null,
        params.search ?? "",
        params.extraFilter ?? null,
        params.pageSize ?? null,
      ]),
    ].join(":");

    let query = this.queries.get(key);
    if (!query) {
      query = new RecordQuery(this, databaseId, viewId, params, key);
      this.queries.set(key, query);
    }
    return query;
  }

  /**
   * Returns a loaded row; observable.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   * @returns the row, or undefined when not loaded.
   */
  recordById(databaseId: string, recordId: string): DatabaseRecord | undefined {
    return this.records.get(recordKey(databaseId, recordId));
  }

  /**
   * Loads one row.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   * @returns the row.
   */
  fetchRecord = async (
    databaseId: string,
    recordId: string
  ): Promise<DatabaseRecord> => {
    const res = await databaseRpc<DatabaseRecord>("/databaseRecords.info", {
      databaseId,
      recordId,
    });
    this.cacheRecords(databaseId, [res.data]);
    return res.data;
  };

  /**
   * Creates a row; it shows in the loaded views it belongs to, at the given
   * place or at the end.
   *
   * @param databaseId the database id.
   * @param fields the initial values.
   * @param order where the row goes in a view.
   * @returns the row.
   */
  create = async (
    databaseId: string,
    fields: Record<string, DatabaseCellInput> = {},
    order?: DatabaseRecordOrder
  ): Promise<DatabaseRecord> => {
    const record = await this.write(databaseId, [], () =>
      databaseRpc<DatabaseRecord>("/databaseRecords.create", {
        databaseId,
        fields,
        order,
      }).then((res) => res.data)
    );
    this.noteLocalWrite(record.id);

    runInAction(() => {
      this.cacheRecords(databaseId, [record]);
      for (const query of this.queriesOf(databaseId)) {
        this.placeInQuery(query, record, {
          anchorId: order?.viewId === query.viewId ? order.anchorId : undefined,
          position: order?.position,
        });
      }
    });
    return record;
  };

  /**
   * Writes cells of a row, shown at once everywhere and restored when the
   * server refuses. A board card whose column value changes changes column.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   * @param fields the new values by field id.
   * @returns the row as saved.
   */
  update = async (
    databaseId: string,
    recordId: string,
    fields: Record<string, DatabaseCellInput>
  ): Promise<DatabaseRecord> => {
    const snapshot = this.snapshot(databaseId, [recordId]);
    runInAction(() => {
      const record = this.applyLocalFields(databaseId, recordId, fields);
      if (record) {
        for (const query of this.queriesOf(databaseId)) {
          this.reconcileMembership(query, record);
        }
      }
    });

    try {
      const record = await this.write(databaseId, [recordId], () =>
        databaseRpc<DatabaseRecord>("/databaseRecords.update", {
          databaseId,
          recordId,
          fields,
        }).then((res) => res.data)
      );
      this.cacheRecords(databaseId, [record]);
      this.invalidateDependents(databaseId, Object.keys(fields), {
        exceptExtraFiltered: true,
      });
      return record;
    } catch (err) {
      snapshot.restore();
      throw err;
    }
  };

  /**
   * Moves rows in a view, optionally writing cells first (a card dropped in
   * another column). Shown at once and restored when the server refuses.
   *
   * @param databaseId the database id.
   * @param viewId the view whose manual order changes.
   * @param params the rows, their anchor and the cells to write.
   * @returns the rows as saved.
   */
  move = async (
    databaseId: string,
    viewId: string,
    params: RecordMoveParams
  ): Promise<DatabaseRecord[]> => {
    const { recordIds, anchorId, position, fields } = params;
    const snapshot = this.snapshot(databaseId, recordIds);

    runInAction(() => {
      const moved = recordIds
        .map((id) =>
          fields
            ? this.applyLocalFields(databaseId, id, fields)
            : this.recordById(databaseId, id)
        )
        .filter((record): record is DatabaseRecord => !!record);

      for (const query of this.queriesOf(databaseId)) {
        if (query.viewId !== viewId) {
          moved.forEach((record) => this.reconcileMembership(query, record));
          continue;
        }
        const removed = query.recordIds.filter((id) => recordIds.includes(id));
        let ids = query.recordIds.filter((id) => !recordIds.includes(id));
        let total = query.total - removed.length;
        const accepted = moved.filter(
          (record) => evaluateFilter(query.params.extraFilter, record) !== false
        );
        if (accepted.length) {
          ids = insertIds(
            ids,
            accepted.map((record) => record.id),
            anchorId,
            position
          );
          total += accepted.length;
        }
        query.setLocal(ids, total);
      }
    });

    try {
      const records = await this.write(databaseId, [...recordIds, viewId], () =>
        databaseRpc<DatabaseRecord[]>("/databaseRecords.move", {
          databaseId,
          viewId,
          recordIds,
          anchorId,
          position,
          fields,
        }).then((res) => res.data)
      );
      this.cacheRecords(databaseId, records);
      if (fields) {
        this.invalidateDependents(databaseId, Object.keys(fields), {
          exceptExtraFiltered: true,
          exceptViewId: viewId,
        });
      }
      return records;
    } catch (err) {
      snapshot.restore();
      throw err;
    }
  };

  /**
   * Deletes rows, hidden at once and restored when the server refuses.
   *
   * @param databaseId the database id.
   * @param recordIds the rows.
   */
  delete = async (databaseId: string, recordIds: string[]): Promise<void> => {
    const snapshot = this.snapshot(databaseId, recordIds);
    this.removeLocal(databaseId, recordIds);

    try {
      await this.write(databaseId, recordIds, () =>
        databaseRpc("/databaseRecords.delete", { databaseId, recordIds })
      );
    } catch (err) {
      snapshot.restore();
      throw err;
    }
  };

  /**
   * Copies a row, placed right after it in the loaded views.
   *
   * @param databaseId the database id.
   * @param recordId the row to copy.
   * @returns the copy.
   */
  duplicate = async (
    databaseId: string,
    recordId: string
  ): Promise<DatabaseRecord> => {
    const record = await this.write(databaseId, [recordId], () =>
      databaseRpc<DatabaseRecord>("/databaseRecords.duplicate", {
        databaseId,
        recordId,
      }).then((res) => res.data)
    );
    this.noteLocalWrite(record.id);

    runInAction(() => {
      this.cacheRecords(databaseId, [record]);
      for (const query of this.queriesOf(databaseId)) {
        if (query.recordIds.includes(recordId)) {
          query.setLocal(
            insertIds(query.recordIds, [record.id], recordId, "after"),
            query.total + 1
          );
        }
      }
    });
    return record;
  };

  /**
   * Opens the page of a row, creating it on first open.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   * @returns the row's document, added to the documents store.
   */
  open = async (databaseId: string, recordId: string): Promise<Document> => {
    const res = await databaseRpc<
      OpenedDocument | { document: OpenedDocument }
    >("/databaseRecords.open", { databaseId, recordId });
    const data = "document" in res.data ? res.data.document : res.data;

    return runInAction(() => {
      res.policies?.forEach((policy) => this.rootStore.policies.add(policy));
      const document = this.rootStore.documents.add(data);
      const record = this.recordById(databaseId, recordId);
      if (record && !record.documentId) {
        this.cacheRecords(databaseId, [{ ...record, documentId: document.id }]);
      }
      return document;
    });
  };

  /**
   * Lists the group headers and counts of a view.
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   * @param params the grouping, filter and search.
   * @returns the group points.
   */
  groups = async (
    databaseId: string,
    viewId: string,
    params: RecordSearchParams & { groupBy?: DatabaseGroup } = {}
  ): Promise<DatabaseGroupPoint[]> => {
    const res = await databaseRpc<DatabaseGroupPoint[]>(
      "/databaseRecords.groups",
      { databaseId, viewId, ...params }
    );
    return res.data;
  };

  /**
   * Computes column statistics (footer of a table).
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   * @param fieldStats the function per field.
   * @param params the filter and search.
   * @returns the value per field.
   */
  aggregate = async (
    databaseId: string,
    viewId: string,
    fieldStats: Record<string, DatabaseStatisticFunc>,
    params: RecordSearchParams = {}
  ): Promise<Record<string, { value: number | string | null }>> => {
    const res = await databaseRpc<
      Record<string, { value: number | string | null }>
    >("/databaseRecords.aggregate", {
      databaseId,
      viewId,
      fieldStats,
      ...params,
    });
    return res.data;
  };

  /**
   * Lists the rows a relation cell can point to.
   *
   * @param databaseId the database id.
   * @param fieldId the relation field.
   * @param params the row being edited, a search and pagination.
   * @returns the candidates.
   */
  linkCandidates = async (
    databaseId: string,
    fieldId: string,
    params: {
      recordId?: string;
      search?: string;
      offset?: number;
      limit?: number;
    } = {}
  ): Promise<LinkCandidate[]> => {
    const res = await databaseRpc<LinkCandidate[]>(
      "/databaseRecords.linkCandidates",
      { databaseId, fieldId, ...params }
    );
    return res.data;
  };

  /**
   * Lists the changes made to a row's cells, newest first.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   * @param cursor the cursor of the next page.
   * @returns the entries and the next cursor.
   */
  history = async (
    databaseId: string,
    recordId: string,
    cursor?: string
  ): Promise<{ entries: DatabaseHistoryEntry[]; nextCursor?: string }> => {
    const res = await databaseRpc<DatabaseHistoryEntry[]>(
      "/databaseRecords.history",
      { databaseId, recordId, cursor }
    );
    const nextCursor = res.pagination?.nextCursor;
    return {
      entries: res.data,
      nextCursor: typeof nextCursor === "string" ? nextCursor : undefined,
    };
  };

  /**
   * Uploads a file into an attachment cell.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   * @param fieldId the attachment field.
   * @param file the file.
   * @returns the row as saved.
   */
  upload = async (
    databaseId: string,
    recordId: string,
    fieldId: string,
    file: File
  ): Promise<DatabaseRecord> => {
    const body = new FormData();
    body.append("databaseId", databaseId);
    body.append("recordId", recordId);
    body.append("fieldId", fieldId);
    body.append("file", file);

    const record = await this.write(databaseId, [recordId], () =>
      databaseRpc<DatabaseRecord>("/databaseRecords.upload", body).then(
        (res) => res.data
      )
    );
    this.cacheRecords(databaseId, [record]);
    return record;
  };

  /**
   * Applies a change announced over the websocket: reloads the touched rows
   * and, when rows may have entered or left a view, the views concerned. A
   * change this tab has just made itself is ignored.
   *
   * @param event the change.
   */
  handleChange = (event: DatabaseChangeEvent) => {
    const { databaseId } = event;
    const database = this.rootStore.databases.get(databaseId);
    const queries = this.queriesOf(databaseId);
    if (!database && queries.length === 0) {
      return;
    }

    const kinds = new Set(event.kinds);
    const recordIds = event.recordIds ?? [];
    const isOwn = event.origin === tabOrigin;
    const isEcho = (ids: string[]) =>
      isOwn && ids.length > 0 && ids.every((id) => this.isRecentLocalWrite(id));

    if (kinds.has("field") || kinds.has("view")) {
      const viewIds = event.viewIds ?? [];
      if (!isEcho([...(event.fieldIds ?? []), ...viewIds])) {
        // A card moved in a view only announces the view, not its rows.
        if (kinds.has("field") || viewIds.length === 0) {
          this.invalidate(databaseId);
        } else {
          viewIds.forEach((viewId) => this.invalidate(databaseId, viewId));
        }
        void this.rootStore.databases
          .fetch(databaseId, { force: true })
          .catch((err: Error) =>
            Logger.warn("Failed to refresh a database schema", {
              message: err.message,
            })
          );
      }
    }

    const touchesRecords =
      kinds.has("record.create") ||
      kinds.has("record.update") ||
      kinds.has("record.delete");
    if (!touchesRecords || isEcho(recordIds)) {
      return;
    }

    if (kinds.has("record.delete")) {
      this.removeLocal(databaseId, recordIds);
    }

    if (kinds.has("record.create")) {
      this.invalidate(databaseId);
      return;
    }

    if (kinds.has("record.update")) {
      const loaded = recordIds.filter((id) => this.recordById(databaseId, id));
      if (recordIds.length === 0 || loaded.length > 25) {
        this.invalidate(databaseId);
        return;
      }
      loaded.forEach((id) => {
        void this.fetchRecord(databaseId, id).catch(() =>
          this.invalidate(databaseId)
        );
      });
      this.invalidateDependents(databaseId, event.fieldIds);
    }
  };

  /**
   * Marks the loaded rows of a database, or of one of its views, as outdated.
   *
   * @param databaseId the database id.
   * @param viewId only this view.
   */
  invalidate = (databaseId: string, viewId?: string) => {
    this.queriesOf(databaseId)
      .filter((query) => !viewId || query.viewId === viewId)
      .forEach((query) => query.invalidate());
  };

  /**
   * Remembers ids this tab has just written, so that the websocket echo of
   * the change is not applied twice.
   *
   * @param ids the row, field or view ids.
   */
  noteLocalWrite = (...ids: string[]) => {
    const now = Date.now();
    ids.forEach((id) => this.recentWrites.set(id, now));
  };

  /**
   * Resolves once no write to the database is in flight.
   *
   * @param databaseId the database id.
   * @returns a promise.
   */
  whenIdle(databaseId: string): Promise<void> {
    return this.pending.get(databaseId)?.idle ?? Promise.resolve();
  }

  /**
   * Counts the writes started on a database, to detect a write that happened
   * while a read was in flight.
   *
   * @param databaseId the database id.
   * @returns the count.
   */
  writeCount(databaseId: string): number {
    return this.writes.get(databaseId) ?? 0;
  }

  /**
   * Stores rows, replacing the loaded versions.
   *
   * @param databaseId the database id.
   * @param records the rows.
   */
  @action
  cacheRecords(databaseId: string, records: DatabaseRecord[]) {
    records.forEach((record) =>
      this.records.set(recordKey(databaseId, record.id), record)
    );
  }

  @action
  clear() {
    this.records.clear();
    this.queries.clear();
    this.recentWrites.clear();
  }

  @observable.shallow
  private records = new Map<string, DatabaseRecord>();

  private queries = new Map<string, RecordQuery>();

  private recentWrites = new Map<string, number>();

  private pending = new Map<
    string,
    { count: number; idle: Promise<void>; resolve: () => void }
  >();

  private writes = new Map<string, number>();

  private queriesOf(databaseId: string): RecordQuery[] {
    return Array.from(this.queries.values()).filter(
      (query) => query.databaseId === databaseId
    );
  }

  private isRecentLocalWrite(id: string): boolean {
    const at = this.recentWrites.get(id);
    return at !== undefined && Date.now() - at < 15000;
  }

  private async write<T>(
    databaseId: string,
    ids: string[],
    request: () => Promise<T>
  ): Promise<T> {
    this.noteLocalWrite(...ids);
    this.writes.set(databaseId, this.writeCount(databaseId) + 1);

    let entry = this.pending.get(databaseId);
    if (!entry) {
      let resolve = () => undefined as void;
      const idle = new Promise<void>((done) => {
        resolve = done;
      });
      entry = { count: 0, idle, resolve };
      this.pending.set(databaseId, entry);
    }
    entry.count += 1;

    try {
      return await request();
    } finally {
      this.noteLocalWrite(...ids);
      entry.count -= 1;
      if (entry.count === 0) {
        this.pending.delete(databaseId);
        entry.resolve();
      }
    }
  }

  @action
  private applyLocalFields(
    databaseId: string,
    recordId: string,
    fields: Record<string, DatabaseCellInput>
  ): DatabaseRecord | undefined {
    const record = this.recordById(databaseId, recordId);
    if (!record) {
      return undefined;
    }

    const values: Record<string, DatabaseCellValue> = { ...record.fields };
    for (const [fieldId, input] of Object.entries(fields)) {
      values[fieldId] = toOptimisticValue(input, (id) => {
        const user = this.rootStore.users.get(id);
        return { name: user?.name ?? "", avatarUrl: user?.avatarUrl };
      });
    }

    const next = { ...record, fields: values };
    this.records.set(recordKey(databaseId, recordId), next);
    return next;
  }

  @action
  private removeLocal(databaseId: string, recordIds: string[]) {
    for (const query of this.queriesOf(databaseId)) {
      const ids = query.recordIds.filter((id) => !recordIds.includes(id));
      if (ids.length !== query.recordIds.length) {
        query.setLocal(
          ids,
          query.total - (query.recordIds.length - ids.length)
        );
      }
    }
  }

  /**
   * Places a new row in a loaded query when its extra filter accepts it.
   * Queries whose first page is not loaded yet will get it from the server.
   */
  private placeInQuery(
    query: RecordQuery,
    record: DatabaseRecord,
    order: { anchorId?: string; position?: DatabaseRecordPosition }
  ) {
    if (!query.isLoaded || query.recordIds.includes(record.id)) {
      return;
    }
    if (evaluateFilter(query.params.extraFilter, record) === false) {
      return;
    }
    if (!order.anchorId && query.hasMore) {
      query.setLocal(query.recordIds, query.total + 1);
      return;
    }
    query.setLocal(
      insertIds(query.recordIds, [record.id], order.anchorId, order.position),
      query.total + 1
    );
  }

  /**
   * Moves an edited row in or out of queries narrowed by an extra filter (a
   * board column), which the client can decide.
   */
  private reconcileMembership(query: RecordQuery, record: DatabaseRecord) {
    if (!query.isLoaded || !query.params.extraFilter) {
      return;
    }
    const matches = evaluateFilter(query.params.extraFilter, record);
    const isIn = query.recordIds.includes(record.id);
    if (matches === false && isIn) {
      query.setLocal(
        query.recordIds.filter((id) => id !== record.id),
        query.total - 1
      );
    } else if (matches === true && !isIn) {
      query.setLocal([record.id, ...query.recordIds], query.total + 1);
    }
  }

  /** Reloads the queries whose rows or order may depend on the given fields. */
  private invalidateDependents(
    databaseId: string,
    fieldIds: string[] | undefined,
    options: { exceptExtraFiltered?: boolean; exceptViewId?: string } = {}
  ) {
    const database = this.rootStore.databases.get(databaseId);
    for (const query of this.queriesOf(databaseId)) {
      if (options.exceptViewId === query.viewId) {
        continue;
      }
      if (
        options.exceptExtraFiltered &&
        query.params.extraFilter &&
        !query.params.filter &&
        !query.params.sort
      ) {
        const view = database?.viewById(query.viewId);
        if (view && !view.filter && !view.sort?.sortObjs.length) {
          continue;
        }
      }
      if (!fieldIds?.length) {
        query.invalidate();
        continue;
      }
      const dependencies = queryFieldIds(
        query.params,
        database?.viewById(query.viewId)
      );
      if (!dependencies || fieldIds.some((id) => dependencies.has(id))) {
        query.invalidate();
      }
    }
  }

  private snapshot(databaseId: string, recordIds: string[]) {
    const records = recordIds.map((id) => this.recordById(databaseId, id));
    const queries = this.queriesOf(databaseId).map((query) => ({
      query,
      recordIds: query.recordIds,
      total: query.total,
    }));

    return {
      restore: action(() => {
        records.forEach((record) => {
          if (record) {
            this.records.set(recordKey(databaseId, record.id), record);
          }
        });
        queries.forEach(({ query, recordIds: ids, total }) =>
          query.setLocal(ids, total)
        );
      }),
    };
  }
}

export { DatabaseRecordsStore };

/** What `databaseRecords.open` returns for the row's document. */
type OpenedDocument = PartialExcept<Document, "id">;

function recordKey(databaseId: string, recordId: string) {
  return `${databaseId}:${recordId}`;
}

function isUserInput(value: unknown): value is DatabaseUserInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "outlineUserId" in value &&
    !("id" in value)
  );
}

function isUserInputList(
  value: DatabaseCellInput
): value is DatabaseUserInput[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item: unknown) => isUserInput(item))
  );
}

function combineFilters(
  ...filters: (DatabaseFilter | null | undefined)[]
): DatabaseFilter | undefined {
  const set = filters.filter(
    (filter): filter is DatabaseFilter =>
      !!filter && filter.filterSet.length > 0
  );
  if (set.length === 0) {
    return undefined;
  }
  if (set.length === 1) {
    return set[0];
  }
  return { conjunction: "and", filterSet: set };
}

function evaluateFilterItem(
  item: DatabaseFilterItem,
  record: DatabaseRecord
): boolean | undefined {
  const cell = record.fields[item.fieldId];
  const text = cellText(cell);

  switch (item.operator) {
    case "isEmpty":
      return isEmptyCell(cell);
    case "isNotEmpty":
      return !isEmptyCell(cell);
    case "is":
      if (typeof item.value !== "string" || text === undefined) {
        return undefined;
      }
      return text === item.value;
    case "isNot":
      if (typeof item.value !== "string" || text === undefined) {
        return undefined;
      }
      return text !== item.value;
    case "isAnyOf":
      if (!Array.isArray(item.value) || text === undefined) {
        return undefined;
      }
      return item.value.includes(text);
    case "isNoneOf":
      if (!Array.isArray(item.value) || text === undefined) {
        return undefined;
      }
      return !item.value.includes(text);
    default:
      return undefined;
  }
}

/** The single text of a single select or text cell, "" when empty, undefined otherwise. */
function cellText(cell: DatabaseCellValue | undefined): string | undefined {
  if (isEmptyCell(cell)) {
    return "";
  }
  if (typeof cell === "string") {
    return cell;
  }
  return undefined;
}

function queryFieldIds(
  params: RecordQueryParams,
  view:
    | {
        filter: DatabaseFilter | null;
        sort: DatabaseSort | null;
        group: DatabaseGroup | null;
        options: { stackFieldId?: string };
      }
    | undefined
): Set<string> | undefined {
  if (!view) {
    return undefined;
  }
  const ids = new Set<string>();
  const addFilter = (filter: DatabaseFilter | null | undefined) =>
    filter?.filterSet.forEach((item) =>
      "filterSet" in item ? addFilter(item) : ids.add(item.fieldId)
    );
  addFilter(params.filter);
  addFilter(params.extraFilter);
  addFilter(view.filter);
  params.sort?.sortObjs.forEach((item) => ids.add(item.fieldId));
  view.sort?.sortObjs.forEach((item) => ids.add(item.fieldId));
  view.group?.forEach((item) => ids.add(item.fieldId));
  if (view.options.stackFieldId) {
    ids.add(view.options.stackFieldId);
  }
  return ids;
}

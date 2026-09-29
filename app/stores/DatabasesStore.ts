import invariant from "invariant";
import { action, makeObservable, override, runInAction } from "mobx";
import { v4 as uuidv4 } from "uuid";
import type {
  DatabaseColumnMeta,
  DatabaseField,
  DatabaseFieldOptions,
  DatabaseFieldType,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseLayout,
  DatabaseRecordPosition,
  DatabaseSettings,
  DatabaseSort,
  DatabaseView,
  DatabaseViewOptions,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import type { JSONObject } from "@shared/types";
import Database from "~/models/Database";
import type Policy from "~/models/Policy";
import type { PaginationParams, Properties } from "~/types";
import { client } from "~/utils/ApiClient";
import type RootStore from "./RootStore";
import Store, { RPCAction, type PaginatedResponse } from "./base/Store";

/** A database as the API presents it, without its schema. */
export interface PresentedDatabase {
  id: string;
  title: string;
  icon: string | null;
  collectionId: string;
  documentId: string | null;
  url: string;
  settings: DatabaseSettings;
  createdAt: string;
  updatedAt: string;
}

/** What `databases.info` and `databases.create` return. */
export interface DatabasePayload {
  database: PresentedDatabase;
  fields: DatabaseField[];
  views: DatabaseView[];
}

export interface DatabaseCreateParams {
  collectionId: string;
  documentId?: string;
  title?: string;
  layout?: DatabaseLayout;
}

export interface DatabaseUpdateParams {
  title?: string;
  icon?: string | null;
  settings?: Partial<DatabaseSettings>;
}

export interface DatabaseListParams extends PaginationParams {
  collectionId?: string;
  query?: string;
}

export interface DatabaseFieldCreateParams {
  name: string;
  type: DatabaseFieldType;
  options?: DatabaseFieldOptions;
  /** The view the new column is shown in first. */
  viewId?: string;
}

export interface DatabaseFieldUpdateParams {
  name?: string;
  description?: string | null;
}

export interface DatabaseViewCreateParams {
  name: string;
  layout: DatabaseLayout;
  options?: Partial<DatabaseViewOptions>;
  overrides?: Partial<DatabaseViewOverrides>;
}

export interface DatabaseViewUpdateParams {
  name?: string;
  filter?: DatabaseFilter | null;
  sort?: DatabaseSort | null;
  group?: DatabaseGroup | null;
  columnMeta?: Record<string, Partial<DatabaseColumnMeta>>;
  options?: Partial<DatabaseViewOptions>;
  overrides?: Partial<DatabaseViewOverrides>;
  isLocked?: boolean;
}

/**
 * Tags the database writes of this tab. The change events echo it, so a tab
 * tells its own writes from those of the same person in another tab.
 */
export const tabOrigin = `tab-${uuidv4()}`;

/**
 * Sends a database RPC; a write is tagged with this tab's origin. The shared
 * database types are interfaces, which are serialisable but not assignable to
 * `JSONObject`'s index signature, hence the single conversion here.
 *
 * @param path the API method, eg "/databases.info".
 * @param body the request body.
 * @returns the parsed response.
 */
export function databaseRpc<T>(
  path: string,
  body: object | FormData
): Promise<{ data: T; policies?: Policy[]; pagination?: JSONObject }> {
  const isWrite = writeMethod.test(path);
  if (body instanceof FormData) {
    if (isWrite && !body.has("origin")) {
      body.append("origin", tabOrigin);
    }
    return client.post(path, body);
  }
  return client.post(
    path,
    isWrite
      ? { origin: tabOrigin, ...(body as JSONObject) }
      : (body as JSONObject)
  );
}

/**
 * Merges a view patch into a view the way the server does: `columnMeta` per
 * field, `options` and `overrides` per key, everything else replaced.
 *
 * @param view the view to patch.
 * @param patch the changes.
 * @returns the patched view.
 */
export function mergeViewPatch(
  view: DatabaseView,
  patch: DatabaseViewUpdateParams
): DatabaseView {
  const columnMeta = { ...view.columnMeta };
  for (const [fieldId, meta] of Object.entries(patch.columnMeta ?? {})) {
    columnMeta[fieldId] = {
      ...columnMeta[fieldId],
      ...meta,
      order: meta.order ?? columnMeta[fieldId]?.order ?? 0,
    };
  }

  return {
    ...view,
    name: patch.name ?? view.name,
    filter: patch.filter !== undefined ? patch.filter : view.filter,
    sort: patch.sort !== undefined ? patch.sort : view.sort,
    group: patch.group !== undefined ? patch.group : view.group,
    isLocked: patch.isLocked ?? view.isLocked,
    columnMeta,
    options: { ...view.options, ...patch.options },
    overrides: { ...view.overrides, ...patch.overrides },
  };
}

/**
 * The databases the user has opened, with their fields and views. Rows are
 * kept by `DatabaseRecordsStore`.
 */
export default class DatabasesStore extends Store<Database> {
  actions = [RPCAction.Info, RPCAction.List];

  constructor(rootStore: RootStore) {
    super(rootStore, Database);
    makeObservable(this);
  }

  /**
   * Fetches a database with its fields and views. A database only known from
   * a list is fetched again, as a list carries no schema.
   *
   * @param id the database id.
   * @param options force to bypass the cache.
   * @returns the database.
   */
  async fetch(
    id: string,
    options: { force?: boolean } = {}
  ): Promise<Database> {
    const force = !!options.force || !this.get(id)?.isSchemaLoaded;
    return super.fetch(id, { force }, (res) =>
      this.toModelData((res as { data: DatabasePayload }).data)
    );
  }

  /**
   * Creates a database, and its engine table, with a default schema.
   *
   * @param params where the database lives and its first view.
   * @returns the database.
   */
  create(params: DatabaseCreateParams): Promise<Database>;
  create(params: Properties<Database>, options?: JSONObject): Promise<Database>;
  @override
  async create(
    params: DatabaseCreateParams | Properties<Database>
  ): Promise<Database> {
    this.isSaving = true;
    try {
      const res = await databaseRpc<DatabasePayload>(
        "/databases.create",
        params
      );
      const database = runInAction(() => {
        invariant(res?.data, "Data should be available");
        this.addPolicies(res.policies ?? []);
        return this.add(this.toModelData(res.data));
      });
      if (!res.policies?.length) {
        void this.fetch(database.id, { force: true }).catch(() => undefined);
      }
      return database;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Renames a database, changes its icon or its settings. Title and icon show
   * at once and are restored when the server refuses.
   *
   * @param id the database id.
   * @param patch the changes; settings keys are merged by the server.
   * @returns the database.
   */
  update(id: string, patch: DatabaseUpdateParams): Promise<Database>;
  update(params: Properties<Database>, options?: JSONObject): Promise<Database>;
  @override
  async update(
    target: string | Properties<Database>,
    patch: DatabaseUpdateParams = {}
  ): Promise<Database> {
    if (typeof target !== "string") {
      return super.update(target);
    }

    const database = this.get(target);
    const previous = database
      ? { title: database.title, icon: database.icon }
      : undefined;
    const { title, icon } = patch;

    if (database) {
      database.updateData({
        ...(title !== undefined ? { title } : {}),
        ...(icon !== undefined ? { icon } : {}),
      });
    }

    try {
      const res = await databaseRpc<PresentedDatabase>("/databases.update", {
        id: target,
        ...patch,
      });
      return runInAction(() => this.add(res.data));
    } catch (err) {
      if (database && previous) {
        database.updateData(previous);
      }
      throw err;
    }
  }

  /**
   * Lists the databases the user can read.
   *
   * @param params filters and pagination.
   * @returns the databases, without their schema.
   */
  list = (
    params: DatabaseListParams = {}
  ): Promise<PaginatedResponse<Database>> =>
    this.fetchPaginated("/databases.list", { ...params });

  /**
   * Adds a column.
   *
   * @param databaseId the database id.
   * @param params the new field.
   * @returns the field.
   */
  createField = async (
    databaseId: string,
    params: DatabaseFieldCreateParams
  ): Promise<DatabaseField> => {
    const res = await databaseRpc<DatabaseField>("/databaseFields.create", {
      databaseId,
      ...params,
    });
    this.rootStore.databaseRecords.noteLocalWrite(res.data.id);
    this.patchSchema(databaseId, (db) => ({
      fields: [...(db.fields ?? []), res.data],
    }));
    if (params.viewId) {
      void this.fetch(databaseId, { force: true });
    }
    return res.data;
  };

  /**
   * Renames a column or changes its description, shown at once.
   *
   * @param databaseId the database id.
   * @param fieldId the field id.
   * @param patch the changes.
   * @returns the field.
   */
  updateField = async (
    databaseId: string,
    fieldId: string,
    patch: DatabaseFieldUpdateParams
  ): Promise<DatabaseField> => {
    this.rootStore.databaseRecords.noteLocalWrite(fieldId);
    const rollback = this.patchSchema(databaseId, (db) => ({
      fields: (db.fields ?? []).map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field
      ),
    }));

    try {
      const res = await databaseRpc<DatabaseField>("/databaseFields.update", {
        databaseId,
        fieldId,
        ...patch,
      });
      this.replaceField(databaseId, res.data);
      return res.data;
    } catch (err) {
      rollback();
      throw err;
    }
  };

  /**
   * Changes the type of a column; its values are converted by the engine.
   *
   * @param databaseId the database id.
   * @param fieldId the field id.
   * @param type the new type.
   * @param options the options of the new type.
   * @returns the field.
   */
  convertField = async (
    databaseId: string,
    fieldId: string,
    type: DatabaseFieldType,
    options?: DatabaseFieldOptions
  ): Promise<DatabaseField> => {
    this.rootStore.databaseRecords.noteLocalWrite(fieldId);
    const res = await databaseRpc<DatabaseField>("/databaseFields.convert", {
      databaseId,
      fieldId,
      type,
      options,
    });
    this.replaceField(databaseId, res.data);
    this.rootStore.databaseRecords.invalidate(databaseId);
    return res.data;
  };

  /**
   * Deletes a column, hidden at once.
   *
   * @param databaseId the database id.
   * @param fieldId the field id.
   */
  deleteField = async (databaseId: string, fieldId: string): Promise<void> => {
    this.rootStore.databaseRecords.noteLocalWrite(fieldId);
    const rollback = this.patchSchema(databaseId, (db) => ({
      fields: (db.fields ?? []).filter((field) => field.id !== fieldId),
    }));

    try {
      await databaseRpc("/databaseFields.delete", { databaseId, fieldId });
    } catch (err) {
      rollback();
      throw err;
    }

    await this.fetch(databaseId, { force: true });
    this.rootStore.databaseRecords.invalidate(databaseId);
  };

  /**
   * Adds a view, as the last tab.
   *
   * @param databaseId the database id.
   * @param params the new view.
   * @returns the view.
   */
  createView = async (
    databaseId: string,
    params: DatabaseViewCreateParams
  ): Promise<DatabaseView> => {
    const res = await databaseRpc<DatabaseView>("/databaseViews.create", {
      databaseId,
      ...params,
    });
    this.rootStore.databaseRecords.noteLocalWrite(res.data.id);
    this.patchSchema(databaseId, (db) => ({
      views: [...(db.views ?? []), res.data],
    }));
    return res.data;
  };

  /**
   * Changes a view for everyone, shown at once and restored when the server
   * refuses.
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   * @param patch the changes, merged like the server merges them.
   * @returns the view.
   */
  updateView = async (
    databaseId: string,
    viewId: string,
    patch: DatabaseViewUpdateParams
  ): Promise<DatabaseView> => {
    this.rootStore.databaseRecords.noteLocalWrite(viewId);
    const rollback = this.patchSchema(databaseId, (db) => ({
      views: (db.views ?? []).map((view) =>
        view.id === viewId ? mergeViewPatch(view, patch) : view
      ),
    }));

    let view: DatabaseView;
    try {
      const res = await databaseRpc<DatabaseView>("/databaseViews.update", {
        databaseId,
        viewId,
        ...patch,
      });
      view = res.data;
    } catch (err) {
      rollback();
      throw err;
    }

    this.patchSchema(databaseId, (db) => ({
      views: (db.views ?? []).map((item) => (item.id === viewId ? view : item)),
    }));

    if (
      patch.filter !== undefined ||
      patch.sort !== undefined ||
      patch.group !== undefined ||
      patch.options?.stackFieldId !== undefined
    ) {
      this.rootStore.databaseRecords.invalidate(databaseId, viewId);
    }
    return view;
  };

  /**
   * Deletes a view, hidden at once.
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   */
  deleteView = async (databaseId: string, viewId: string): Promise<void> => {
    this.rootStore.databaseRecords.noteLocalWrite(viewId);
    const rollback = this.patchSchema(databaseId, (db) => ({
      views: (db.views ?? []).filter((view) => view.id !== viewId),
    }));

    try {
      await databaseRpc("/databaseViews.delete", { databaseId, viewId });
    } catch (err) {
      rollback();
      throw err;
    }
  };

  /**
   * Copies a view, placed right after it.
   *
   * @param databaseId the database id.
   * @param viewId the view to copy.
   * @returns the new view.
   */
  duplicateView = async (
    databaseId: string,
    viewId: string
  ): Promise<DatabaseView> => {
    const res = await databaseRpc<DatabaseView>("/databaseViews.duplicate", {
      databaseId,
      viewId,
    });
    this.rootStore.databaseRecords.noteLocalWrite(res.data.id);
    this.patchSchema(databaseId, (db) => ({
      views: [...(db.views ?? []), res.data],
    }));
    return res.data;
  };

  /**
   * Moves a tab before or after another one, shown at once.
   *
   * @param databaseId the database id.
   * @param viewId the view to move.
   * @param anchorId the view it is placed next to.
   * @param position which side of the anchor.
   * @returns the views in their new order.
   */
  reorderView = async (
    databaseId: string,
    viewId: string,
    anchorId: string,
    position: DatabaseRecordPosition
  ): Promise<DatabaseView[]> => {
    this.rootStore.databaseRecords.noteLocalWrite(viewId, anchorId);
    const rollback = this.patchSchema(databaseId, (db) => {
      const ordered = [...db.orderedViews];
      const moving = ordered.find((view) => view.id === viewId);
      if (!moving) {
        return {};
      }
      const rest = ordered.filter((view) => view.id !== viewId);
      const anchorIndex = rest.findIndex((view) => view.id === anchorId);
      if (anchorIndex === -1) {
        return {};
      }
      rest.splice(
        position === "before" ? anchorIndex : anchorIndex + 1,
        0,
        moving
      );
      return {
        views: rest.map((view, index) => ({ ...view, order: index })),
      };
    });

    try {
      const res = await databaseRpc<DatabaseView[]>("/databaseViews.reorder", {
        databaseId,
        viewId,
        anchorId,
        position,
      });
      this.patchSchema(databaseId, () => ({ views: res.data }));
      return res.data;
    } catch (err) {
      rollback();
      throw err;
    }
  };

  /**
   * Replaces fields or views of a loaded database.
   *
   * @param databaseId the database id.
   * @param patcher returns the new fields and/or views.
   * @returns a function that restores the previous fields and views.
   */
  @action
  private patchSchema(
    databaseId: string,
    patcher: (database: Database) => Partial<Pick<Database, "fields" | "views">>
  ): () => void {
    const database = this.get(databaseId);
    if (!database) {
      return () => undefined;
    }

    const previous = { fields: database.fields, views: database.views };
    database.updateData(patcher(database));

    return action(() => {
      database.updateData(previous);
    });
  }

  private replaceField(databaseId: string, field: DatabaseField) {
    this.patchSchema(databaseId, (db) => ({
      fields: (db.fields ?? []).map((item) =>
        item.id === field.id ? field : item
      ),
    }));
  }

  private toModelData(payload: DatabasePayload) {
    return {
      ...payload.database,
      fields: payload.fields,
      views: payload.views,
    };
  }
}

export { DatabasesStore };

/** The database routes that write: their change events echo the origin. */
const writeMethod =
  /\.(create|createFromTemplate|update|convert|move|reorder|duplicate|delete|upload)$/;

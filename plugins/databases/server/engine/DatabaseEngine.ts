import type {
  DatabaseCellValue,
  DatabaseColumnMeta,
  DatabaseEngineViewType,
  DatabaseField,
  DatabaseFieldOptions,
  DatabaseFieldType,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseGroupLayout,
  DatabaseGroupPoint,
  DatabaseHistoryEntry,
  DatabaseLayout,
  DatabaseLookupOptions,
  DatabaseRecord,
  DatabaseRecordOrder,
  DatabaseRecordPosition,
  DatabaseSort,
  DatabaseStatisticFunc,
  DatabaseStatisticResult,
  DatabaseView,
  DatabaseViewOptions,
} from "@shared/databases/types";

/**
 * The storage engine behind a database. Routes only talk to this interface, so
 * that the data can move to another engine without touching them. Every call
 * is made on behalf of an actor, whose identity the engine records.
 */
export interface DatabaseEngine {
  /**
   * Returns the fields and views of a table, without Outline's overrides.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @returns the schema.
   */
  getSchema(actor: DatabaseActor, ref: DatabaseRef): Promise<DatabaseSchema>;

  /**
   * Returns the engine's own description of a table.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @returns the table's name.
   */
  describeTable(
    actor: DatabaseActor,
    ref: DatabaseRef
  ): Promise<DatabaseTableInfo>;

  /**
   * Lists records of a view, every field included (hidden ones too).
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param query the view, the reader's filter, sort and search, and the page.
   * @returns a page of records and the total matching the query.
   */
  listRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseRecordQuery
  ): Promise<DatabaseRecordPage>;

  /**
   * Returns one record with every field.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param recordId the record.
   * @returns the record.
   */
  getRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string
  ): Promise<DatabaseRecord>;

  /**
   * Creates a record.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param input the cell values, keyed by field id, and an optional position.
   * @returns the created record.
   */
  createRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord>;

  /**
   * Updates the given cells of a record.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param recordId the record.
   * @param input the cell values, keyed by field id, and an optional position.
   * @returns the updated record.
   */
  updateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord>;

  /**
   * Writes the same cells on several records, then moves them next to an
   * anchor in a view (a drop on a board column).
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param input the records, the cells, and the target position.
   * @returns the moved records.
   */
  moveRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordMove
  ): Promise<DatabaseRecord[]>;

  /**
   * Deletes records.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param recordIds the records.
   */
  deleteRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordIds: string[]
  ): Promise<void>;

  /**
   * Duplicates a record.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param recordId the record to copy.
   * @param order where to put the copy in a view.
   * @returns the copy.
   */
  duplicateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    order?: DatabaseRecordOrder
  ): Promise<DatabaseRecord>;

  /**
   * Returns the group headers and row counts of a view.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param query the view, grouping, filter and search.
   * @returns the group points.
   */
  groupPoints(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseGroupQuery
  ): Promise<DatabaseGroupPoint[]>;

  /**
   * Computes one statistic per field over the records of a view.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param query the view, the statistics, filter and search.
   * @returns the value of each statistic, keyed by field id.
   */
  aggregate(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseAggregateQuery
  ): Promise<Record<string, DatabaseAggregateValue>>;

  /**
   * Lists the records of the linked table a link cell can point to.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table holding the link field.
   * @param query the link field, the record being edited, search and page.
   * @returns the candidates with their title.
   */
  linkCandidates(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseLinkCandidateQuery
  ): Promise<DatabaseLinkCandidate[]>;

  /**
   * Returns the change history of a record, newest first.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param recordId the record.
   * @param cursor the cursor of the next page, from a previous call.
   * @returns a page of history entries.
   */
  recordHistory(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    cursor?: string
  ): Promise<DatabaseHistoryPage>;

  /**
   * Uploads a file into an attachment cell.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param input the record, the field and the file.
   * @returns the updated record.
   */
  uploadAttachment(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseAttachmentUpload
  ): Promise<DatabaseRecord>;

  /**
   * Creates a field.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param input the field to create.
   * @returns the field.
   */
  createField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseFieldCreate
  ): Promise<DatabaseField>;

  /**
   * Renames a field or changes its description.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param fieldId the field.
   * @param input the new name and description.
   * @returns the field.
   */
  updateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldUpdate
  ): Promise<DatabaseField>;

  /**
   * Changes the type or the options of a field, converting its values.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param fieldId the field.
   * @param input the new type and options.
   * @returns the field.
   */
  convertField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldConvert
  ): Promise<DatabaseField>;

  /**
   * Duplicates a field with its values.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param fieldId the field to copy.
   * @param input the name of the copy (the source's, made unique, when not
   * given) and the view it is added from.
   * @returns the copy.
   */
  duplicateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldDuplicate
  ): Promise<DatabaseField>;

  /**
   * Deletes a field.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param fieldId the field.
   */
  deleteField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string
  ): Promise<void>;

  /**
   * Creates a view.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param input the view to create.
   * @returns the view.
   */
  createView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseViewCreate
  ): Promise<DatabaseView>;

  /**
   * Updates the given settings of a view.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param viewId the view.
   * @param input the settings to change.
   * @returns the view.
   */
  updateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    input: DatabaseViewUpdate
  ): Promise<DatabaseView>;

  /**
   * Deletes a view.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param viewId the view.
   */
  deleteView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<void>;

  /**
   * Duplicates a view.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param viewId the view to copy.
   * @returns the copy.
   */
  duplicateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<DatabaseView>;

  /**
   * Moves a view next to another one.
   *
   * @param actor the person the call is made for.
   * @param ref the engine table.
   * @param viewId the view to move.
   * @param position the anchor view and the side.
   * @returns every view, in their new order.
   */
  reorderView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    position: DatabaseViewPosition
  ): Promise<DatabaseView[]>;

  /**
   * Creates a base, the container of related tables, as the service account.
   *
   * @param name the name of the base.
   * @returns the engine id of the base.
   */
  createBase(name: string): Promise<string>;

  /**
   * Creates a table in a base with its fields and first view.
   *
   * @param actor the person the call is made for.
   * @param externalBaseId the base.
   * @param input the table to create.
   * @returns the engine id of the table and its schema.
   */
  createTable(
    actor: DatabaseActor,
    externalBaseId: string,
    input: DatabaseTableCreate
  ): Promise<DatabaseCreatedTable>;

  /**
   * Makes sure the engine knows these people, creating them when needed.
   *
   * @param users the people, by email.
   * @returns the engine user id of each email (lower-cased).
   */
  ensureUsers(users: DatabaseEngineUserInput[]): Promise<Map<string, string>>;
}

/** A person acting in Outline, or Outline itself for background work. */
export type DatabaseActor = DatabaseUserActor | "system";

export interface DatabaseUserActor {
  email: string;
  name: string;
  outlineUserId: string;
}

/** Where a database's data lives in the engine. */
export interface DatabaseRef {
  externalBaseId: string;
  externalTableId: string;
}

export interface DatabaseSchema {
  fields: DatabaseField[];
  views: DatabaseView[];
}

export interface DatabaseTableInfo {
  name: string;
}

export interface DatabaseRecordQuery {
  viewId?: string;
  /** ANDed with the view's filter, or replacing it with `replaceFilter`. */
  filter?: DatabaseFilter | null;
  replaceFilter?: boolean;
  /** Sorted before the view's sort. */
  sort?: DatabaseSort | null;
  search?: string;
  /** The order of the view's groups and those it folds away (not for boards, whose columns have their own). */
  groupLayout?: DatabaseGroupLayout;
  skip: number;
  take: number;
}

export interface DatabaseRecordPage {
  records: DatabaseRecord[];
  total: number;
}

export interface DatabaseRecordWrite {
  fields: Record<string, DatabaseCellValue>;
  order?: DatabaseRecordOrder;
}

export interface DatabaseRecordMove {
  viewId: string;
  recordIds: string[];
  anchorId?: string;
  position?: DatabaseRecordPosition;
  fields?: Record<string, DatabaseCellValue>;
}

export interface DatabaseGroupQuery {
  viewId: string;
  groupBy?: DatabaseGroup | null;
  filter?: DatabaseFilter | null;
  search?: string;
  /** The order of the view's groups and those it folds away, when grouped as the view says. */
  groupLayout?: DatabaseGroupLayout;
}

export interface DatabaseAggregateQuery {
  viewId: string;
  fieldStats: Record<string, DatabaseStatisticFunc>;
  filter?: DatabaseFilter | null;
  search?: string;
  /** Also compute each statistic per group of the view (Notion's calculation under every group). */
  byGroup?: boolean;
  /** The order of the view's groups and those it folds away. */
  groupLayout?: DatabaseGroupLayout;
}

export type DatabaseAggregateValue = DatabaseStatisticResult;

export interface DatabaseLinkCandidateQuery {
  fieldId: string;
  recordId?: string;
  search?: string;
  skip: number;
  take: number;
}

export interface DatabaseLinkCandidate {
  id: string;
  title: string;
}

export interface DatabaseHistoryPage {
  entries: DatabaseHistoryEntry[];
  nextCursor: string | null;
}

export interface DatabaseAttachmentUpload {
  recordId: string;
  fieldId: string;
  /** Path of the uploaded file on the local disk. */
  filePath: string;
  fileName: string;
  mimeType: string;
}

export interface DatabaseFieldCreate {
  name: string;
  type: DatabaseFieldType;
  options?: DatabaseFieldOptions;
  /** The link and the field a rollup or a lookup reads through. */
  lookupOptions?: DatabaseLookupOptions;
  /** A lookup: the field shows the looked-up values as they are. */
  isLookup?: boolean;
  /** The view the field is added from, where it stays visible. */
  viewId?: string;
}

export interface DatabaseFieldUpdate {
  name?: string;
  description?: string | null;
}

export interface DatabaseFieldDuplicate {
  name?: string;
  viewId?: string;
}

export interface DatabaseFieldConvert {
  type: DatabaseFieldType;
  options?: DatabaseFieldOptions;
  /** The link and the field a rollup or a lookup reads through; kept from the field when not given. */
  lookupOptions?: DatabaseLookupOptions;
  isLookup?: boolean;
}

export interface DatabaseViewCreate {
  name: string;
  type: DatabaseEngineViewType;
  options?: DatabaseViewOptions;
  columnMeta?: Record<string, Partial<DatabaseColumnMeta>>;
}

export interface DatabaseViewUpdate {
  name?: string;
  description?: string | null;
  filter?: DatabaseFilter | null;
  sort?: DatabaseSort | null;
  group?: DatabaseGroup | null;
  columnMeta?: Record<string, Partial<DatabaseColumnMeta>>;
  options?: DatabaseViewOptionsPatch;
  isLocked?: boolean;
}

/** View options to change; null clears an option. */
export type DatabaseViewOptionsPatch = {
  [K in keyof DatabaseViewOptions]?: DatabaseViewOptions[K] | null;
};

export interface DatabaseViewPosition {
  anchorId: string;
  position: DatabaseRecordPosition;
}

export interface DatabaseTableCreate {
  name: string;
  fields: DatabaseTableFieldCreate[];
  view: DatabaseTableViewCreate;
}

/** A field of a new table; the first one is the primary field. */
export interface DatabaseTableFieldCreate {
  /** A key the view options can refer to (`stackFieldKey`, `dateFieldKey`). */
  key: string;
  name: string;
  type: DatabaseFieldType;
  options?: DatabaseFieldOptions;
}

export interface DatabaseTableViewCreate {
  name: string;
  layout: DatabaseLayout;
  /** The field the board stacks by, as a key of `fields`. */
  stackFieldKey?: string;
  /** The date field of a calendar, as a key of `fields`. */
  dateFieldKey?: string;
}

export interface DatabaseCreatedTable {
  externalTableId: string;
  /** Engine field id of each field key of the input. */
  fieldIds: Record<string, string>;
  fields: DatabaseField[];
  views: DatabaseView[];
}

export interface DatabaseEngineUserInput {
  email: string;
  name: string;
}

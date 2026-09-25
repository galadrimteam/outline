import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseRecord,
  DatabaseRecordOrder,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
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
import { layoutForViewType } from "../../utils/layouts";

/** A call received by the fake engine, for assertions. */
export interface FakeEngineCall {
  method: keyof DatabaseEngine;
  actor: DatabaseActor | null;
  ref: DatabaseRef | null;
  args: unknown[];
}

/**
 * An in-memory database engine for route tests: one table with a primary
 * text field and a status field, a grid view and a board view.
 */
export class FakeEngine implements DatabaseEngine {
  public calls: FakeEngineCall[] = [];

  public fields: DatabaseField[] = [
    fakeField("fldName", "Name", DatabaseFieldType.SingleLineText, true),
    fakeField("fldStatus", "Status", DatabaseFieldType.SingleSelect, false),
    fakeField("fldPerson", "Person", DatabaseFieldType.User, false),
  ];

  public views: DatabaseView[] = [
    fakeView("viwGrid", "Grid", "grid", 0),
    fakeView("viwBoard", "Board", "kanban", 1),
  ];

  public records = new Map<string, DatabaseRecord>();

  public engineUsers = new Map<string, string>();

  public nextBaseId = "bseCreated";

  public nextTableId = "tblCreated";

  /**
   * Adds a record to the table.
   *
   * @param id the record id.
   * @param fields the cells.
   * @returns the record.
   */
  public addRecord(
    id: string,
    fields: Record<string, DatabaseCellValue>
  ): DatabaseRecord {
    const record = { id, fields };
    this.records.set(id, record);
    return record;
  }

  /**
   * Returns the calls made to a method.
   *
   * @param method the method.
   * @returns the calls.
   */
  public callsTo(method: keyof DatabaseEngine): FakeEngineCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  async getSchema(
    actor: DatabaseActor,
    ref: DatabaseRef
  ): Promise<DatabaseSchema> {
    this.record("getSchema", actor, ref);
    return { fields: [...this.fields], views: [...this.views] };
  }

  async describeTable(
    actor: DatabaseActor,
    ref: DatabaseRef
  ): Promise<DatabaseTableInfo> {
    this.record("describeTable", actor, ref);
    return { name: "Engine table" };
  }

  async listRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseRecordQuery
  ): Promise<DatabaseRecordPage> {
    this.record("listRecords", actor, ref, query);
    const all = [...this.records.values()];
    return {
      records: all.slice(query.skip, query.skip + query.take),
      total: all.length,
    };
  }

  async getRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string
  ): Promise<DatabaseRecord> {
    this.record("getRecord", actor, ref, recordId);
    return this.existing(recordId);
  }

  async createRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord> {
    this.record("createRecord", actor, ref, input);
    return this.addRecord(`rec${this.records.size + 1}`, input.fields);
  }

  async updateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord> {
    this.record("updateRecord", actor, ref, recordId, input);
    const record = this.existing(recordId);
    record.fields = { ...record.fields, ...input.fields };
    return record;
  }

  async moveRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordMove
  ): Promise<DatabaseRecord[]> {
    this.record("moveRecords", actor, ref, input);
    return input.recordIds.map((id) => {
      const record = this.existing(id);
      record.fields = { ...record.fields, ...input.fields };
      return record;
    });
  }

  async deleteRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordIds: string[]
  ): Promise<void> {
    this.record("deleteRecords", actor, ref, recordIds);
    recordIds.forEach((id) => this.records.delete(id));
  }

  async duplicateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    order?: DatabaseRecordOrder
  ): Promise<DatabaseRecord> {
    this.record("duplicateRecord", actor, ref, recordId, order);
    const source = this.existing(recordId);
    return this.addRecord(`${recordId}Copy`, { ...source.fields });
  }

  async groupPoints(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseGroupQuery
  ): Promise<DatabaseGroupPoint[]> {
    this.record("groupPoints", actor, ref, query);
    return [
      {
        type: "header",
        id: "grp1",
        depth: 0,
        value: "To do",
        isCollapsed: false,
      },
      { type: "row", count: this.records.size },
    ];
  }

  async aggregate(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseAggregateQuery
  ): Promise<Record<string, DatabaseAggregateValue>> {
    this.record("aggregate", actor, ref, query);
    const result: Record<string, DatabaseAggregateValue> = {};
    for (const fieldId of Object.keys(query.fieldStats)) {
      result[fieldId] = { value: this.records.size };
    }
    return result;
  }

  async linkCandidates(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseLinkCandidateQuery
  ): Promise<DatabaseLinkCandidate[]> {
    this.record("linkCandidates", actor, ref, query);
    return [{ id: "recLinked", title: "Linked" }];
  }

  async recordHistory(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    cursor?: string
  ): Promise<DatabaseHistoryPage> {
    this.record("recordHistory", actor, ref, recordId, cursor);
    return { entries: [], nextCursor: null };
  }

  async uploadAttachment(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseAttachmentUpload
  ): Promise<DatabaseRecord> {
    this.record("uploadAttachment", actor, ref, input);
    return this.existing(input.recordId);
  }

  async createField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseFieldCreate
  ): Promise<DatabaseField> {
    this.record("createField", actor, ref, input);
    const field = fakeField(
      `fld${this.fields.length + 1}`,
      input.name,
      input.type,
      false
    );
    this.fields.push(field);
    return field;
  }

  async updateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldUpdate
  ): Promise<DatabaseField> {
    this.record("updateField", actor, ref, fieldId, input);
    const field = this.fieldById(fieldId);
    Object.assign(field, { name: input.name ?? field.name });
    return field;
  }

  async convertField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldConvert
  ): Promise<DatabaseField> {
    this.record("convertField", actor, ref, fieldId, input);
    const field = this.fieldById(fieldId);
    field.type = input.type;
    return field;
  }

  async duplicateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldDuplicate
  ): Promise<DatabaseField> {
    this.record("duplicateField", actor, ref, fieldId, input);
    const source = this.fieldById(fieldId);
    const field = { ...source, id: `${fieldId}Copy`, isPrimary: false };
    field.name = input.name ?? source.name;
    this.fields.push(field);
    return field;
  }

  async deleteField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string
  ): Promise<void> {
    this.record("deleteField", actor, ref, fieldId);
    this.fields = this.fields.filter((field) => field.id !== fieldId);
  }

  async createView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseViewCreate
  ): Promise<DatabaseView> {
    this.record("createView", actor, ref, input);
    const view = {
      ...fakeView(
        `viw${this.views.length + 1}`,
        input.name,
        input.type,
        this.views.length
      ),
      options: input.options ?? {},
    };
    this.views.push(view);
    return view;
  }

  async updateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    input: DatabaseViewUpdate
  ): Promise<DatabaseView> {
    this.record("updateView", actor, ref, viewId, input);
    const view = this.viewById(viewId);
    if (input.name) {
      view.name = input.name;
    }
    if (input.filter !== undefined) {
      view.filter = input.filter;
    }
    return view;
  }

  async deleteView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<void> {
    this.record("deleteView", actor, ref, viewId);
    this.views = this.views.filter((view) => view.id !== viewId);
  }

  async duplicateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<DatabaseView> {
    this.record("duplicateView", actor, ref, viewId);
    const source = this.viewById(viewId);
    const view = { ...source, id: `${viewId}Copy`, order: this.views.length };
    this.views.push(view);
    return view;
  }

  async reorderView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    position: DatabaseViewPosition
  ): Promise<DatabaseView[]> {
    this.record("reorderView", actor, ref, viewId, position);
    return [...this.views];
  }

  async createBase(name: string): Promise<string> {
    this.record("createBase", null, null, name);
    return this.nextBaseId;
  }

  async createTable(
    actor: DatabaseActor,
    externalBaseId: string,
    input: DatabaseTableCreate
  ): Promise<DatabaseCreatedTable> {
    this.record("createTable", actor, null, externalBaseId, input);
    const fieldIds: Record<string, string> = {};
    const fields = input.fields.map((field, index) => {
      fieldIds[field.key] = `fldNew${index}`;
      return fakeField(`fldNew${index}`, field.name, field.type, index === 0);
    });
    const views = [
      fakeView(
        "viwNew",
        input.view.name,
        input.view.layout === DatabaseLayout.Board ? "kanban" : "grid",
        0
      ),
    ];
    return { externalTableId: this.nextTableId, fieldIds, fields, views };
  }

  async ensureUsers(
    users: DatabaseEngineUserInput[]
  ): Promise<Map<string, string>> {
    this.record("ensureUsers", null, null, users);
    for (const user of users) {
      if (!this.engineUsers.has(user.email)) {
        this.engineUsers.set(user.email, `usr${this.engineUsers.size + 1}`);
      }
    }
    return new Map(this.engineUsers);
  }

  private record(
    method: keyof DatabaseEngine,
    actor: DatabaseActor | null,
    ref: DatabaseRef | null,
    ...args: unknown[]
  ) {
    this.calls.push({ method, actor, ref, args });
  }

  private existing(recordId: string): DatabaseRecord {
    const record = this.records.get(recordId);
    if (!record) {
      throw new Error(`Unknown record ${recordId}`);
    }
    return record;
  }

  private fieldById(fieldId: string): DatabaseField {
    const field = this.fields.find((item) => item.id === fieldId);
    if (!field) {
      throw new Error(`Unknown field ${fieldId}`);
    }
    return field;
  }

  private viewById(viewId: string): DatabaseView {
    const view = this.views.find((item) => item.id === viewId);
    if (!view) {
      throw new Error(`Unknown view ${viewId}`);
    }
    return view;
  }
}

function fakeField(
  id: string,
  name: string,
  type: DatabaseFieldType,
  isPrimary: boolean
): DatabaseField {
  return {
    id,
    name,
    type,
    options: {},
    isPrimary,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
  };
}

function fakeView(
  id: string,
  name: string,
  type: DatabaseView["type"],
  order: number
): DatabaseView {
  return {
    id,
    name,
    type,
    layout: layoutForViewType(type),
    order,
    filter: null,
    sort: null,
    group: null,
    columnMeta: {},
    options: {},
    overrides: {},
    isLocked: false,
  };
}

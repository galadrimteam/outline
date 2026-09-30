import { randomInt } from "node:crypto";
import fs from "node:fs";
import FormData from "form-data";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseRecord,
  DatabaseRecordOrder,
  DatabaseStatisticFunc,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { InternalError, ValidationError } from "@server/errors";
import { CacheHelper } from "@server/utils/CacheHelper";
import { cellText } from "../../utils/cellText";
import { viewTypeForLayout } from "../../utils/layouts";
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
  DatabaseViewOptionsPatch,
  DatabaseViewPosition,
  DatabaseViewUpdate,
} from "../DatabaseEngine";
import type { TeableClient, TeableQuery, TeableRequest } from "./TeableClient";
import { TeableUnauthorizedError } from "./TeableClient";
import type { TeableIdentity } from "./TeableIdentity";
import type { TeableMapper } from "./TeableMapper";
import type {
  TeableAggregationVo,
  TeableBaseVo,
  TeableCellValue,
  TeableField,
  TeableGroupPoint,
  TeableHistoryVo,
  TeableRecord,
  TeableRecordsVo,
  TeableRowCountVo,
  TeableTableVo,
  TeableView,
} from "./types";

/**
 * The Teable implementation of a database engine. Every call is made with a
 * token of the actor scoped to the database's base, so Teable records who did
 * what; records are always read and written with fields keyed by id.
 */
export class TeableEngine implements DatabaseEngine {
  /**
   * @param client the transport to Teable.
   * @param identity obtains the actors' tokens.
   * @param mapper translates Teable's shapes.
   */
  constructor(
    private readonly client: TeableClient,
    private readonly identity: TeableIdentity,
    private readonly mapper: TeableMapper
  ) {}

  /**
   * Forgets the cached field ids of a table, after its fields changed in
   * Teable.
   *
   * @param externalTableId the Teable table.
   */
  public static async forgetFields(externalTableId: string) {
    await CacheHelper.removeData(fieldIdsKey({ externalTableId }));
  }

  async getSchema(
    actor: DatabaseActor,
    ref: DatabaseRef
  ): Promise<DatabaseSchema> {
    const [fields, views] = await Promise.all([
      this.call<TeableField[]>(actor, ref.externalBaseId, {
        method: "GET",
        path: `${tablePath(ref)}/field`,
      }),
      this.call<TeableView[]>(actor, ref.externalBaseId, {
        method: "GET",
        path: `${tablePath(ref)}/view`,
      }),
    ]);
    await CacheHelper.setData(
      fieldIdsKey(ref),
      fields.map((field) => field.id),
      TeableEngine.fieldIdsExpiry
    );
    return {
      fields: fields.map((field) => this.mapper.field(field)),
      views: views
        .map((view) => this.mapper.view(view))
        .sort((a, b) => a.order - b.order),
    };
  }

  async describeTable(
    actor: DatabaseActor,
    ref: DatabaseRef
  ): Promise<DatabaseTableInfo> {
    const table = await this.call<TeableTableVo>(actor, ref.externalBaseId, {
      method: "GET",
      path: `/api/base/${encode(ref.externalBaseId)}/table/${encode(ref.externalTableId)}`,
    });
    return { name: table.name };
  }

  async listRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseRecordQuery
  ): Promise<DatabaseRecordPage> {
    const fieldIds = await this.fieldIds(actor, ref);
    const base: TeableQuery = {
      viewId: query.viewId,
      filter: query.filter?.filterSet.length
        ? JSON.stringify(query.filter)
        : undefined,
      search: searchTuple(query.search),
    };
    let sortObjs = query.sort?.sortObjs ?? [];

    // Teable ANDs a filter with the view's; replacing it means ignoring the
    // view's query, whose sort is then applied explicitly.
    if (query.replaceFilter && query.viewId) {
      const view = await this.call<TeableView>(actor, ref.externalBaseId, {
        method: "GET",
        path: `${tablePath(ref)}/view/${encode(query.viewId)}`,
      });
      base.ignoreViewQuery = "true";
      const sorted = new Set(sortObjs.map((item) => item.fieldId));
      sortObjs = [
        ...sortObjs,
        ...(view.sort?.sortObjs ?? []).filter(
          (item) => !sorted.has(item.fieldId)
        ),
      ];
    }

    const [page, count] = await Promise.all([
      this.call<TeableRecordsVo>(actor, ref.externalBaseId, {
        method: "GET",
        path: `${tablePath(ref)}/record`,
        query: {
          ...base,
          orderBy: sortObjs.length ? JSON.stringify(sortObjs) : undefined,
          projection: fieldIds,
          fieldKeyType: "id",
          take: query.take,
          skip: query.skip,
        },
      }),
      this.call<TeableRowCountVo>(actor, ref.externalBaseId, {
        method: "GET",
        path: `${tablePath(ref)}/aggregation/row-count`,
        query: base,
      }),
    ]);
    return {
      records: page.records.map((record) => this.mapper.record(record)),
      total: count.rowCount,
    };
  }

  async getRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string
  ): Promise<DatabaseRecord> {
    const record = await this.call<TeableRecord>(actor, ref.externalBaseId, {
      method: "GET",
      path: `${tablePath(ref)}/record/${encode(recordId)}`,
      query: { fieldKeyType: "id" },
    });
    return this.mapper.record(record);
  }

  async createRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord> {
    const res = await this.call<TeableRecordsVo>(actor, ref.externalBaseId, {
      method: "POST",
      path: `${tablePath(ref)}/record`,
      body: {
        fieldKeyType: "id",
        typecast: true,
        order: input.order,
        records: [{ fields: this.writeFields(input.fields) }],
      },
    });
    const [record] = res.records;
    if (!record) {
      throw InternalError("The database engine created no record");
    }
    return this.checkedRecord(record, input.fields);
  }

  async updateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    input: DatabaseRecordWrite
  ): Promise<DatabaseRecord> {
    const record = await this.call<TeableRecord>(actor, ref.externalBaseId, {
      method: "PATCH",
      path: `${tablePath(ref)}/record/${encode(recordId)}`,
      body: {
        fieldKeyType: "id",
        typecast: true,
        order: input.order,
        record: { fields: this.writeFields(input.fields) },
      },
    });
    return this.checkedRecord(record, input.fields);
  }

  async moveRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseRecordMove
  ): Promise<DatabaseRecord[]> {
    if (input.fields && Object.keys(input.fields).length) {
      const fields = this.writeFields(input.fields);
      await this.call<TeableRecord[]>(actor, ref.externalBaseId, {
        method: "PATCH",
        path: `${tablePath(ref)}/record`,
        body: {
          fieldKeyType: "id",
          typecast: true,
          records: input.recordIds.map((id) => ({ id, fields })),
        },
      });
    }
    if (input.anchorId) {
      await this.call<void>(actor, ref.externalBaseId, {
        method: "PUT",
        path: `${tablePath(ref)}/view/${encode(input.viewId)}/record-order`,
        body: {
          anchorId: input.anchorId,
          position: input.position ?? "before",
          recordIds: input.recordIds,
        },
      });
    }

    const fieldIds = await this.fieldIds(actor, ref);
    const page = await this.call<TeableRecordsVo>(actor, ref.externalBaseId, {
      method: "GET",
      path: `${tablePath(ref)}/record`,
      query: {
        selectedRecordIds: input.recordIds,
        projection: fieldIds,
        fieldKeyType: "id",
        take: input.recordIds.length,
      },
    });
    return page.records.map((record) =>
      this.checkedRecord(record, input.fields ?? {})
    );
  }

  async deleteRecords(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordIds: string[]
  ): Promise<void> {
    await this.call<void>(actor, ref.externalBaseId, {
      method: "DELETE",
      path: `${tablePath(ref)}/record`,
      query: { recordIds },
    });
  }

  async duplicateRecord(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    order?: DatabaseRecordOrder
  ): Promise<DatabaseRecord> {
    const record = await this.call<TeableRecord>(actor, ref.externalBaseId, {
      method: "POST",
      path: `${tablePath(ref)}/record/${encode(recordId)}/duplicate`,
      body: order ?? {},
    });
    return this.getRecord(actor, ref, record.id);
  }

  async groupPoints(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseGroupQuery
  ): Promise<DatabaseGroupPoint[]> {
    const points = await this.call<TeableGroupPoint[] | null>(
      actor,
      ref.externalBaseId,
      {
        method: "GET",
        path: `${tablePath(ref)}/aggregation/group-points`,
        query: {
          viewId: query.viewId,
          groupBy: query.groupBy ? JSON.stringify(query.groupBy) : undefined,
          filter: query.filter ? JSON.stringify(query.filter) : undefined,
          search: searchTuple(query.search),
        },
      }
    );
    return this.mapper.groupPoints(points);
  }

  async aggregate(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseAggregateQuery
  ): Promise<Record<string, DatabaseAggregateValue>> {
    const fieldsByFunc: Partial<Record<DatabaseStatisticFunc, string[]>> = {};
    for (const [fieldId, func] of Object.entries(query.fieldStats)) {
      fieldsByFunc[func] = [...(fieldsByFunc[func] ?? []), fieldId];
    }
    const res = await this.call<TeableAggregationVo>(
      actor,
      ref.externalBaseId,
      {
        method: "GET",
        path: `${tablePath(ref)}/aggregation`,
        query: {
          viewId: query.viewId,
          filter: query.filter ? JSON.stringify(query.filter) : undefined,
          search: searchTuple(query.search),
          field: fieldsByFunc,
        },
      }
    );
    const result: Record<string, DatabaseAggregateValue> = {};
    for (const aggregation of res.aggregations ?? []) {
      result[aggregation.fieldId] = { value: aggregation.total?.value ?? null };
    }
    return result;
  }

  async linkCandidates(
    actor: DatabaseActor,
    ref: DatabaseRef,
    query: DatabaseLinkCandidateQuery
  ): Promise<DatabaseLinkCandidate[]> {
    const field = await this.call<TeableField>(actor, ref.externalBaseId, {
      method: "GET",
      path: `${tablePath(ref)}/field/${encode(query.fieldId)}`,
    });
    const foreignTableId = field.options?.foreignTableId;
    const lookupFieldId = field.options?.lookupFieldId;
    if (
      field.type !== DatabaseFieldType.Link ||
      !foreignTableId ||
      !lookupFieldId
    ) {
      throw ValidationError("The field is not a link to another table");
    }

    const page = await this.call<TeableRecordsVo>(
      actor,
      field.options?.baseId ?? ref.externalBaseId,
      {
        method: "GET",
        path: `/api/table/${encode(foreignTableId)}/record`,
        query: {
          filterLinkCellCandidate: query.recordId
            ? [query.fieldId, query.recordId]
            : query.fieldId,
          search: query.search
            ? [query.search, lookupFieldId, "true"]
            : undefined,
          projection: [lookupFieldId],
          fieldKeyType: "id",
          take: query.take,
          skip: query.skip,
        },
      }
    );
    return page.records.map((record) => ({
      id: record.id,
      title: cellText(this.mapper.cell(record.fields[lookupFieldId])),
    }));
  }

  async recordHistory(
    actor: DatabaseActor,
    ref: DatabaseRef,
    recordId: string,
    cursor?: string
  ): Promise<DatabaseHistoryPage> {
    const history = await this.call<TeableHistoryVo>(
      actor,
      ref.externalBaseId,
      {
        method: "GET",
        path: `${tablePath(ref)}/record/${encode(recordId)}/history`,
        query: { cursor },
      }
    );
    return {
      entries: this.mapper.history(history),
      nextCursor: history.nextCursor ?? null,
    };
  }

  async uploadAttachment(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseAttachmentUpload
  ): Promise<DatabaseRecord> {
    const form = new FormData();
    form.append("file", fs.createReadStream(input.filePath), {
      filename: input.fileName,
      contentType: input.mimeType,
    });
    await this.call<TeableRecord>(actor, ref.externalBaseId, {
      method: "POST",
      path: `${tablePath(ref)}/record/${encode(input.recordId)}/${encode(input.fieldId)}/uploadAttachment`,
      form,
      timeout: TeableEngine.uploadTimeout,
    });
    return this.getRecord(actor, ref, input.recordId);
  }

  async createField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseFieldCreate
  ): Promise<DatabaseField> {
    const field = await this.call<TeableField>(actor, ref.externalBaseId, {
      method: "POST",
      path: `${tablePath(ref)}/field`,
      body: {
        name: input.name,
        type: input.type,
        options: input.options,
        lookupOptions: input.lookupOptions,
        isLookup: input.isLookup,
        viewId: input.viewId,
      },
    });
    await CacheHelper.removeData(fieldIdsKey(ref));
    return this.mapper.field(field);
  }

  async updateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldUpdate
  ): Promise<DatabaseField> {
    await this.call<void>(actor, ref.externalBaseId, {
      method: "PATCH",
      path: `${tablePath(ref)}/field/${encode(fieldId)}`,
      body: input,
    });
    const field = await this.call<TeableField>(actor, ref.externalBaseId, {
      method: "GET",
      path: `${tablePath(ref)}/field/${encode(fieldId)}`,
    });
    return this.mapper.field(field);
  }

  async convertField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldConvert
  ): Promise<DatabaseField> {
    const field = await this.call<TeableField>(actor, ref.externalBaseId, {
      method: "PUT",
      path: `${tablePath(ref)}/field/${encode(fieldId)}/convert`,
      body: {
        type: input.type,
        options: input.options,
        lookupOptions: input.lookupOptions,
        isLookup: input.isLookup,
      },
    });
    return this.mapper.field(field);
  }

  async duplicateField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string,
    input: DatabaseFieldDuplicate
  ): Promise<DatabaseField> {
    const name =
      input.name ??
      (
        await this.call<TeableField>(actor, ref.externalBaseId, {
          method: "GET",
          path: `${tablePath(ref)}/field/${encode(fieldId)}`,
        })
      ).name;
    const field = await this.call<TeableField>(actor, ref.externalBaseId, {
      method: "POST",
      path: `${tablePath(ref)}/field/${encode(fieldId)}/duplicate`,
      body: { name, viewId: input.viewId },
    });
    await CacheHelper.removeData(fieldIdsKey(ref));
    return this.mapper.field(field);
  }

  async deleteField(
    actor: DatabaseActor,
    ref: DatabaseRef,
    fieldId: string
  ): Promise<void> {
    await this.call<void>(actor, ref.externalBaseId, {
      method: "DELETE",
      path: `${tablePath(ref)}/field/${encode(fieldId)}`,
    });
    await CacheHelper.removeData(fieldIdsKey(ref));
  }

  async createView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    input: DatabaseViewCreate
  ): Promise<DatabaseView> {
    const view = await this.call<TeableView>(actor, ref.externalBaseId, {
      method: "POST",
      path: `${tablePath(ref)}/view`,
      body: {
        name: input.name,
        type: input.type,
        options: input.options,
        columnMeta: input.columnMeta,
      },
    });
    return this.mapper.view(view);
  }

  async updateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    input: DatabaseViewUpdate
  ): Promise<DatabaseView> {
    const path = `${tablePath(ref)}/view/${encode(viewId)}`;
    const put = (suffix: string, body: unknown) =>
      this.call<void>(actor, ref.externalBaseId, {
        method: "PUT",
        path: `${path}/${suffix}`,
        body,
      });

    if (input.name !== undefined) {
      await put("name", { name: input.name });
    }
    if (input.description !== undefined) {
      await put("description", { description: input.description });
    }
    if (input.filter !== undefined) {
      await put("filter", { filter: input.filter });
    }
    if (input.sort !== undefined) {
      await put("sort", { sort: input.sort });
    }
    if (input.group !== undefined) {
      await put("group", { group: input.group });
    }
    if (input.columnMeta && Object.keys(input.columnMeta).length) {
      await put(
        "column-meta",
        Object.entries(input.columnMeta).map(([fieldId, columnMeta]) => ({
          fieldId,
          columnMeta,
        }))
      );
    }
    if (input.options && Object.keys(input.options).length) {
      await this.call<void>(actor, ref.externalBaseId, {
        method: "PATCH",
        path: `${path}/options`,
        body: { options: teableViewOptions(input.options) },
      });
    }
    if (input.isLocked !== undefined) {
      await put("locked", { isLocked: input.isLocked });
    }

    const view = await this.call<TeableView>(actor, ref.externalBaseId, {
      method: "GET",
      path,
    });
    return this.mapper.view(view);
  }

  async deleteView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<void> {
    await this.call<void>(actor, ref.externalBaseId, {
      method: "DELETE",
      path: `${tablePath(ref)}/view/${encode(viewId)}`,
    });
  }

  async duplicateView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string
  ): Promise<DatabaseView> {
    const view = await this.call<TeableView>(actor, ref.externalBaseId, {
      method: "POST",
      path: `${tablePath(ref)}/view/${encode(viewId)}/duplicate`,
    });
    return this.mapper.view(view);
  }

  async reorderView(
    actor: DatabaseActor,
    ref: DatabaseRef,
    viewId: string,
    position: DatabaseViewPosition
  ): Promise<DatabaseView[]> {
    await this.call<void>(actor, ref.externalBaseId, {
      method: "PUT",
      path: `${tablePath(ref)}/view/${encode(viewId)}/order`,
      body: position,
    });
    const views = await this.call<TeableView[]>(actor, ref.externalBaseId, {
      method: "GET",
      path: `${tablePath(ref)}/view`,
    });
    return views
      .map((view) => this.mapper.view(view))
      .sort((a, b) => a.order - b.order);
  }

  async createBase(name: string): Promise<string> {
    const spaceId = await this.identity.spaceId();
    const base = await this.call<TeableBaseVo>("system", null, {
      method: "POST",
      path: "/api/base",
      body: { spaceId, name },
    });
    return base.id;
  }

  async createTable(
    actor: DatabaseActor,
    externalBaseId: string,
    input: DatabaseTableCreate
  ): Promise<DatabaseCreatedTable> {
    const fieldIds: Record<string, string> = {};
    for (const field of input.fields) {
      fieldIds[field.key] = generateFieldId();
    }
    const table = await this.call<TeableTableVo>(actor, externalBaseId, {
      method: "POST",
      path: `/api/base/${encode(externalBaseId)}/table/`,
      body: {
        name: input.name,
        fields: input.fields.map((field) => ({
          id: fieldIds[field.key],
          name: field.name,
          type: field.type,
          options: field.options,
        })),
        views: [this.tableViewRo(input, fieldIds)],
        records: [],
      },
    });
    return {
      externalTableId: table.id,
      fieldIds,
      fields: table.fields.map((field) => this.mapper.field(field)),
      views: table.views.map((view) => this.mapper.view(view)),
    };
  }

  ensureUsers(users: DatabaseEngineUserInput[]): Promise<Map<string, string>> {
    return this.identity.ensureUsers(users);
  }

  private static fieldIdsExpiry = 30;

  private static uploadTimeout = 120000;

  /**
   * Calls Teable with the actor's token for the base, asking for a new token
   * once when Teable refuses a cached one.
   */
  private async call<T>(
    actor: DatabaseActor,
    baseId: string | null,
    request: Omit<TeableRequest, "token">
  ): Promise<T> {
    const token = await this.identity.token(actor, baseId);
    try {
      return await this.client.request<T>({ ...request, token });
    } catch (err) {
      if (!(err instanceof TeableUnauthorizedError)) {
        throw err;
      }
    }

    await this.identity.invalidate(actor, baseId);
    const freshToken = await this.identity.token(actor, baseId);
    try {
      return await this.client.request<T>({ ...request, token: freshToken });
    } catch (err) {
      if (err instanceof TeableUnauthorizedError) {
        throw InternalError("The database engine refused the credentials");
      }
      throw err;
    }
  }

  /** Every field id of the table, so that listings return hidden fields too. */
  private async fieldIds(actor: DatabaseActor, ref: DatabaseRef) {
    const ids = await CacheHelper.getDataOrSet<string[]>(
      fieldIdsKey(ref),
      async () => {
        const fields = await this.call<TeableField[]>(
          actor,
          ref.externalBaseId,
          { method: "GET", path: `${tablePath(ref)}/field` }
        );
        return fields.map((field) => field.id);
      },
      TeableEngine.fieldIdsExpiry
    );
    return ids ?? [];
  }

  /**
   * Maps a record Teable returned after a write, making sure it kept every
   * person written: under `typecast` Teable drops the users it cannot match.
   */
  private checkedRecord(
    teableRecord: TeableRecord,
    written: Record<string, DatabaseCellValue>
  ): DatabaseRecord {
    const record = this.mapper.record(teableRecord);
    for (const [fieldId, value] of Object.entries(written)) {
      const kept = new Set(this.mapper.userIds(record.fields[fieldId]));
      if (this.mapper.userIds(value).some((id) => !kept.has(id))) {
        throw ValidationError("A person could not be set in this cell");
      }
    }
    return record;
  }

  private writeFields(
    fields: Record<string, DatabaseCellValue>
  ): Record<string, TeableCellValue> {
    const result: Record<string, TeableCellValue> = {};
    for (const [fieldId, value] of Object.entries(fields)) {
      result[fieldId] = this.mapper.writeCell(value);
    }
    return result;
  }

  private tableViewRo(
    input: DatabaseTableCreate,
    fieldIds: Record<string, string>
  ) {
    const { view } = input;
    const type = viewTypeForLayout(view.layout);
    const stackFieldId = view.stackFieldKey
      ? fieldIds[view.stackFieldKey]
      : undefined;
    const dateFieldId = view.dateFieldKey
      ? fieldIds[view.dateFieldKey]
      : undefined;

    if (view.layout === DatabaseLayout.Board && stackFieldId) {
      return { name: view.name, type, options: { stackFieldId } };
    }
    if (view.layout === DatabaseLayout.Calendar && dateFieldId) {
      return {
        name: view.name,
        type,
        options: { startDateFieldId: dateFieldId, endDateFieldId: dateFieldId },
      };
    }
    return { name: view.name, type };
  }
}

/**
 * Teable's options accept null to clear an id, except the grid's frozen
 * field, where an empty id means the default (the primary field).
 */
function teableViewOptions(options: DatabaseViewOptionsPatch) {
  return options.frozenFieldId === null
    ? { ...options, frozenFieldId: "" }
    : options;
}

function tablePath(ref: DatabaseRef) {
  return `/api/table/${encode(ref.externalTableId)}`;
}

function fieldIdsKey(ref: Pick<DatabaseRef, "externalTableId">) {
  return `databases:teable:fields:${ref.externalTableId}`;
}

function encode(id: string) {
  return encodeURIComponent(id);
}

/** Teable's search tuple: value, fields (all when empty), hide non matching rows. */
function searchTuple(search: string | undefined) {
  return search ? [search, "", "true"] : undefined;
}

const idAlphabet =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A Teable field id (`fld` and 16 alphanumerics), known before the table exists. */
function generateFieldId() {
  let id = "fld";
  for (let i = 0; i < 16; i++) {
    id += idAlphabet[randomInt(idAlphabet.length)];
  }
  return id;
}

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  DatabaseCellValue,
  DatabaseEngineViewType,
  DatabaseField,
  DatabaseFieldOptions,
  DatabaseLookupOptions,
  DatabaseRecord,
  DatabaseRecordPosition,
  DatabaseView,
  DatabaseViewOptions,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { NotFoundError, ValidationError } from "@server/errors";
import type { User } from "@server/models";
import fetch from "@server/utils/fetch";
import { engineFor } from "../engine";
import type {
  DatabaseEngine,
  DatabaseRef,
  DatabaseUserActor,
  DatabaseViewUpdate,
} from "../engine/DatabaseEngine";
import { processOutlineStore } from "../engine/outline/processCaches";
import { emailUserId } from "../engine/outline/users";
import { actorFor } from "../utils/actor";

/** The one space of the gateway: Outline has no spaces, a base belongs to the team. */
export const GatewaySpaceId = "spcOutline";

/** A field as the migration tools send it, in Teable's words. */
export interface GatewayFieldInput {
  name: string;
  type: DatabaseFieldType;
  options?: DatabaseFieldOptions;
  lookupOptions?: DatabaseLookupOptions;
  isLookup?: boolean;
}

/** Records to write, keyed by field name or id, cast like Teable's `typecast`. */
export interface GatewayRecordsInput {
  fieldKeyType: "name" | "id";
  typecast: boolean;
  records: { id?: string; fields: Record<string, DatabaseCellValue> }[];
}

export interface GatewayRecordQuery {
  viewId?: string;
  ignoreViewQuery: boolean;
  skip: number;
  take: number;
}

export interface GatewayViewInput {
  name: string;
  type: DatabaseEngineViewType;
  options?: DatabaseViewOptions;
  columnMeta?: DatabaseViewUpdate["columnMeta"];
  filter?: DatabaseViewUpdate["filter"];
  sort?: DatabaseViewUpdate["sort"];
  group?: DatabaseViewUpdate["group"];
}

/**
 * Builds Outline engine bases for the Notion migration tools (migration/notion-to-teable.mjs, sync_views.py,
 * link_rows.py), which were written against Teable's REST API: the gateway answers the few Teable calls they make
 * and writes straight into the Outline engine, as the admin whose API key the tools carry.
 */
export class TeableGateway {
  private readonly engine: DatabaseEngine;
  private readonly actor: DatabaseUserActor;
  private readonly store = processOutlineStore();

  /**
   * @param user the admin running the migration; everything is written as them.
   */
  constructor(private readonly user: User) {
    this.engine = engineFor(
      { engine: "outline", teamId: user.teamId },
      { origin: "outline" }
    );
    this.actor = actorFor(user);
  }

  /**
   * Creates a base.
   *
   * @param name the name of the base, kept by the caller only: an Outline base is the set of its tables.
   * @returns the base.
   */
  public async createBase(name: string) {
    const id = await this.engine.createBase(name);
    return { id, name, spaceId: GatewaySpaceId };
  }

  /**
   * Lists the tables of a base.
   *
   * @param baseId the base.
   * @returns the tables, with their id and name.
   */
  public async tables(baseId: string) {
    const snapshots = await this.store.base(baseId);
    return snapshots
      .filter((snapshot) => snapshot.table.teamId === this.user.teamId)
      .map((snapshot) => ({
        id: snapshot.table.id,
        name: snapshot.table.name,
      }));
  }

  /**
   * Creates a table with its first fields (no relation: those are added once the table exists) and a grid view.
   *
   * @param baseId the base.
   * @param input the name and the fields; the first field is the primary one.
   * @returns the table as Teable describes it.
   */
  public async createTable(
    baseId: string,
    input: { name: string; fields: GatewayFieldInput[] }
  ) {
    const created = await this.engine.createTable(this.actor, baseId, {
      name: input.name,
      fields: input.fields.map((field, index) => ({
        key: String(index),
        name: field.name,
        type: field.type,
        options: field.options,
      })),
      view: { name: "Grid view", layout: DatabaseLayout.Table },
    });
    return {
      id: created.externalTableId,
      name: input.name,
      fields: created.fields,
      views: created.views,
      defaultViewId: created.views[0]?.id,
    };
  }

  /**
   * Lists the fields of a table.
   *
   * @param tableId the table.
   * @returns the fields.
   */
  public async fields(tableId: string): Promise<DatabaseField[]> {
    const ref = await this.ref(tableId);
    return (await this.engine.getSchema(this.actor, ref)).fields;
  }

  /**
   * Lists the views of a table.
   *
   * @param tableId the table.
   * @returns the views.
   */
  public async views(tableId: string): Promise<DatabaseView[]> {
    const ref = await this.ref(tableId);
    return (await this.engine.getSchema(this.actor, ref)).views;
  }

  /**
   * Creates a field, a relation, a formula, a rollup or a lookup included.
   *
   * @param tableId the table.
   * @param input the field.
   * @returns the field.
   */
  public async createField(tableId: string, input: GatewayFieldInput) {
    const ref = await this.ref(tableId);
    return this.engine.createField(this.actor, ref, {
      name: input.name,
      type: input.type,
      options: input.options,
      lookupOptions: input.lookupOptions,
      isLookup: input.isLookup,
    });
  }

  /**
   * Renames a field or changes its description.
   *
   * @param tableId the table.
   * @param fieldId the field.
   * @param input the new name and description.
   * @returns the field.
   */
  public async updateField(
    tableId: string,
    fieldId: string,
    input: { name?: string; description?: string | null }
  ) {
    const ref = await this.ref(tableId);
    return this.engine.updateField(this.actor, ref, fieldId, input);
  }

  /**
   * Changes the type or the options of a field, and its name when given.
   *
   * @param tableId the table.
   * @param fieldId the field.
   * @param input the new type, options and name.
   * @returns the field.
   */
  public async convertField(
    tableId: string,
    fieldId: string,
    input: GatewayFieldInput
  ) {
    const ref = await this.ref(tableId);
    const field = await this.engine.convertField(this.actor, ref, fieldId, {
      type: input.type,
      options: input.options,
      lookupOptions: input.lookupOptions,
      isLookup: input.isLookup,
    });
    if (input.name && input.name !== field.name) {
      return this.engine.updateField(this.actor, ref, fieldId, {
        name: input.name,
      });
    }
    return field;
  }

  /**
   * Deletes a field.
   *
   * @param tableId the table.
   * @param fieldId the field.
   */
  public async deleteField(tableId: string, fieldId: string) {
    const ref = await this.ref(tableId);
    await this.engine.deleteField(this.actor, ref, fieldId);
  }

  /**
   * Lists records, in the order of a view when one is given.
   *
   * @param tableId the table.
   * @param query the view, whether to ignore its filter, and the page.
   * @returns the records.
   */
  public async records(tableId: string, query: GatewayRecordQuery) {
    const ref = await this.ref(tableId);
    const page = await this.engine.listRecords(this.actor, ref, {
      viewId: query.viewId,
      filter: null,
      replaceFilter: query.ignoreViewQuery,
      skip: query.skip,
      take: query.take,
    });
    return { records: page.records, total: page.total };
  }

  /**
   * Creates records.
   *
   * @param tableId the table.
   * @param input the records, keyed by field name or id.
   * @returns the created records, in the order given.
   */
  public async createRecords(tableId: string, input: GatewayRecordsInput) {
    const ref = await this.ref(tableId);
    const cells = await this.prepare(ref, input);
    const records: DatabaseRecord[] = [];
    for (const fields of cells) {
      records.push(await this.engine.createRecord(this.actor, ref, { fields }));
    }
    return { records };
  }

  /**
   * Writes cells of existing records.
   *
   * @param tableId the table.
   * @param input the records with their id, keyed by field name or id.
   * @returns the records.
   */
  public async updateRecords(tableId: string, input: GatewayRecordsInput) {
    const ref = await this.ref(tableId);
    const cells = await this.prepare(ref, input);
    const records: DatabaseRecord[] = [];
    for (const [index, fields] of cells.entries()) {
      const id = input.records[index].id;
      if (!id) {
        throw ValidationError("A record to update needs its id");
      }
      records.push(
        await this.engine.updateRecord(this.actor, ref, id, { fields })
      );
    }
    return records;
  }

  /**
   * Adds a file found at a URL to an attachment cell.
   *
   * @param tableId the table.
   * @param recordId the record.
   * @param fieldId the attachment field.
   * @param fileUrl where to download the file.
   * @returns the record.
   */
  public async uploadAttachment(
    tableId: string,
    recordId: string,
    fieldId: string,
    fileUrl: string
  ) {
    const ref = await this.ref(tableId);
    const res = await fetch(fileUrl, { timeout: 60000 });
    if (!res.ok) {
      throw ValidationError(
        `The file could not be downloaded (HTTP ${res.status})`
      );
    }
    const fileName =
      decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() || "") ||
      "file";
    const dir = await mkdtemp(path.join(os.tmpdir(), "teable-gateway-"));
    const filePath = path.join(dir, "upload");
    try {
      await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
      return await this.engine.uploadAttachment(this.actor, ref, {
        recordId,
        fieldId,
        filePath,
        fileName,
        mimeType: res.headers.get("content-type") || "application/octet-stream",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Creates a view, with its filter, sort and grouping when given.
   *
   * @param tableId the table.
   * @param input the view.
   * @returns the view.
   */
  public async createView(tableId: string, input: GatewayViewInput) {
    const ref = await this.ref(tableId);
    const view = await this.engine.createView(this.actor, ref, {
      name: input.name,
      type: input.type,
      options: input.options,
      columnMeta: input.columnMeta,
    });
    const { filter, sort, group } = input;
    if (filter === undefined && sort === undefined && group === undefined) {
      return view;
    }
    return this.engine.updateView(this.actor, ref, view.id, {
      filter,
      sort,
      group,
    });
  }

  /**
   * Changes settings of a view.
   *
   * @param tableId the table.
   * @param viewId the view.
   * @param input the settings to change.
   * @returns the view.
   */
  public async updateView(
    tableId: string,
    viewId: string,
    input: DatabaseViewUpdate
  ) {
    const ref = await this.ref(tableId);
    return this.engine.updateView(this.actor, ref, viewId, input);
  }

  /**
   * Moves a view next to another one.
   *
   * @param tableId the table.
   * @param viewId the view.
   * @param anchorId the other view.
   * @param position the side.
   */
  public async reorderView(
    tableId: string,
    viewId: string,
    anchorId: string,
    position: DatabaseRecordPosition
  ) {
    const ref = await this.ref(tableId);
    await this.engine.reorderView(this.actor, ref, viewId, {
      anchorId,
      position,
    });
  }

  /**
   * Places records, in the order given, next to an anchor record in a view.
   *
   * @param tableId the table.
   * @param viewId the view.
   * @param input the records, the anchor and the side.
   */
  public async orderRecords(
    tableId: string,
    viewId: string,
    input: {
      recordIds: string[];
      anchorId: string;
      position: DatabaseRecordPosition;
    }
  ) {
    const ref = await this.ref(tableId);
    await this.engine.moveRecords(this.actor, ref, { viewId, ...input });
  }

  /**
   * Returns the engine id of each person, by email; a person without an Outline account yet is kept by email and
   * becomes the account once it exists.
   *
   * @param users the people.
   * @returns the people with their engine id.
   */
  public async ensureUsers(users: { email: string; name: string }[]) {
    const ids = await this.engine.ensureUsers(users);
    return {
      users: users.map((user) => {
        const email = user.email.toLowerCase();
        return { email, id: ids.get(email) ?? emailUserId(email) };
      }),
    };
  }

  private async ref(tableId: string): Promise<DatabaseRef> {
    const snapshot = await this.store.table(tableId).catch(() => null);
    if (!snapshot || snapshot.table.teamId !== this.user.teamId) {
      throw NotFoundError("Table not found");
    }
    return { externalBaseId: snapshot.table.baseId, externalTableId: tableId };
  }

  /**
   * Keys the cells by field id and, with `typecast`, adds the select options they name that the field does not
   * have yet (Teable's typecast creates them the same way) and reads numbers written as text.
   */
  private async prepare(
    ref: DatabaseRef,
    input: GatewayRecordsInput
  ): Promise<Record<string, DatabaseCellValue>[]> {
    let fields = (await this.engine.getSchema(this.actor, ref)).fields;
    const cells = input.records.map((record) =>
      keyById(fields, record.fields, input.fieldKeyType)
    );
    if (!input.typecast) {
      return cells;
    }
    for (const field of fields) {
      if (
        field.type !== DatabaseFieldType.SingleSelect &&
        field.type !== DatabaseFieldType.MultipleSelect
      ) {
        continue;
      }
      const known = new Set((field.options.choices ?? []).map((c) => c.name));
      const missing = [
        ...new Set(cells.flatMap((row) => choiceNames(row[field.id]))),
      ].filter((name) => !known.has(name));
      if (missing.length) {
        await this.engine.convertField(this.actor, ref, field.id, {
          type: field.type,
          options: {
            ...field.options,
            choices: [
              ...(field.options.choices ?? []),
              ...missing.map((name) => ({ name, color: "grayLight2" })),
            ],
          },
        });
      }
    }
    fields = (await this.engine.getSchema(this.actor, ref)).fields;
    return cells.map((row) => castNumbers(fields, row));
  }
}

function keyById(
  fields: DatabaseField[],
  cells: Record<string, DatabaseCellValue>,
  keyType: "name" | "id"
): Record<string, DatabaseCellValue> {
  if (keyType === "id") {
    return cells;
  }
  const result: Record<string, DatabaseCellValue> = {};
  for (const [name, value] of Object.entries(cells)) {
    const field = fields.find((item) => item.name === name);
    if (!field) {
      throw ValidationError(`Unknown field "${name}"`);
    }
    result[field.id] = value;
  }
  return result;
}

function choiceNames(value: DatabaseCellValue | undefined): string[] {
  if (typeof value === "string") {
    return value ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item !== ""
    );
  }
  return [];
}

function castNumbers(
  fields: DatabaseField[],
  cells: Record<string, DatabaseCellValue>
): Record<string, DatabaseCellValue> {
  const result = { ...cells };
  for (const field of fields) {
    const value = result[field.id];
    if (
      (field.type === DatabaseFieldType.Number ||
        field.type === DatabaseFieldType.Rating) &&
      typeof value === "string"
    ) {
      const number = Number(value.replace(",", ".").trim());
      result[field.id] = value.trim() === "" || isNaN(number) ? null : number;
    }
  }
  return result;
}

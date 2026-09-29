import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseFieldOptions,
  DatabaseLinkValue,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { toError } from "@shared/utils/error";
import { NotFoundError, ValidationError } from "@server/errors";
import Logger from "@server/logging/Logger";
import { Database } from "@server/models";
import { sequelize } from "@server/storage/database";
import { MutexLock } from "@server/utils/MutexLock";
import type { OutlineStore } from "../engine/outline/store/OutlineStore";
import type {
  EngineFieldRow,
  EngineRecordRow,
  EngineTableRow,
  EngineViewRow,
} from "../engine/outline/types";
import type { EngineUserDirectory } from "../engine/outline/users";
import { emailUserId } from "../engine/outline/users";
import type { TeableBaseSource } from "../engine/teable/TeableBaseReader";
import type { TeableMapper } from "../engine/teable/TeableMapper";
import type {
  TeableCellValue,
  TeableField,
  TeableObjectValue,
  TeableRecord,
  TeableTableMetaVo,
  TeableView,
} from "../engine/teable/types";
import type { DatabaseFileStore } from "../utils/DatabaseFileStore";

export interface DatabaseEngineMoverDeps {
  /** Reads the Teable base. */
  source: TeableBaseSource;
  /** Where the Outline engine keeps its tables. */
  store: OutlineStore;
  /** Keeps the files of attachment cells in Outline. */
  files: DatabaseFileStore;
  /** The Outline engine's people. */
  users: EngineUserDirectory;
  /** Maps Teable's cell values to neutral ones. */
  mapper: TeableMapper;
}

export interface DatabaseEngineMoveInput {
  /** A database of the base to move. */
  database: Database;
  /** Reads and counts without writing anything. */
  dryRun: boolean;
}

/** What a move did, or would do on a dry run. */
export interface DatabaseEngineMoveResult {
  baseId: string;
  dryRun: boolean;
  tables: DatabaseEngineMovedTable[];
  /** Outline databases switched to the Outline engine (to switch, on a dry run). */
  databaseIds: string[];
  /** Files of attachment cells; a file that could not be copied keeps its Teable link, which expires. */
  attachments: { total: number; copied: number; failed: number };
  /** Teable users no email is known for: their person cells are dropped and the records they wrote have no author. */
  unresolvedUsers: string[];
  /** What stays in Teable only. */
  notMoved: string[];
}

export interface DatabaseEngineMovedTable {
  id: string;
  name: string;
  fields: number;
  views: number;
  records: number;
  attachments: number;
  /** Outline databases of the table; none for a table only reached through links. */
  databaseIds: string[];
}

/**
 * Moves the Teable base behind a database into the Outline engine: every
 * table of the base (links, lookups and rollups never leave it, and some
 * linked tables have no Outline database), with the ids of tables, fields,
 * views and records kept, so that row pages, `databases.settings` and
 * documents pointing at records keep working. Then switches every Outline
 * database of those tables to the Outline engine, in one transaction.
 *
 * Computed cells are left to the engine, people become engine users (the
 * Outline member with that email, else `email:<address>`), files become
 * Outline attachments, and each view keeps its manual row order. Record
 * history stays in Teable. A change made in Teable while the move runs
 * aborts it. Teable is only read: switching `engine` back to "teable" undoes
 * the move, losing what was written since.
 */
export class DatabaseEngineMover {
  /**
   * @param deps the Teable reader, the Outline store, the file store, the
   * engine's people and the mapper.
   */
  constructor(private readonly deps: DatabaseEngineMoverDeps) {}

  /**
   * Moves the base of a database, or counts what would move.
   *
   * @param input the database and whether to only count.
   * @returns what was moved.
   * @throws ValidationError when the base is not on Teable, already moved,
   * links outside itself, is being moved, or changed during the move.
   */
  async move(
    input: DatabaseEngineMoveInput
  ): Promise<DatabaseEngineMoveResult> {
    const { database } = input;
    if (database.engine !== "teable") {
      throw ValidationError(
        `This database is on the "${database.engine}" engine, not on Teable`
      );
    }
    const result = await MutexLock.tryUsing(
      `databases:move:${database.externalBaseId}`,
      DatabaseEngineMover.lockTimeout,
      () => this.moveBase(input)
    );
    if (!result) {
      throw ValidationError("This base is already being moved");
    }
    return result;
  }

  private static lockTimeout = 30000;

  /** Views that show records, whose manual order is kept. */
  private static orderedViewTypes = new Set([
    "grid",
    "kanban",
    "gallery",
    "calendar",
  ]);

  private async moveBase({
    database,
    dryRun,
  }: DatabaseEngineMoveInput): Promise<DatabaseEngineMoveResult> {
    const { teamId, externalBaseId: baseId } = database;
    const tables = await this.deps.source.tables(baseId);
    const databases = await this.databasesToSwitch(database, tables);
    const read = await this.read(baseId, tables);

    const run: MoveRun = {
      dryRun,
      baseId,
      people: await this.people(teamId, baseId, read),
      attachments: { total: 0, copied: 0, failed: 0 },
    };
    const moves: TableMove[] = [];
    for (const table of read) {
      moves.push(await this.tableMove(run, teamId, table));
    }

    const result: DatabaseEngineMoveResult = {
      baseId,
      dryRun,
      tables: moves.map((move) => ({
        id: move.table.id,
        name: move.table.name,
        fields: move.fields.length,
        views: move.views.length,
        records: move.records.length,
        attachments: move.attachments,
        databaseIds: databases
          .filter((item) => item.externalTableId === move.table.id)
          .map((item) => item.id),
      })),
      databaseIds: databases.map((item) => item.id),
      attachments: run.attachments,
      unresolvedUsers: [...run.people.unresolved].sort(),
      notMoved: ["record history"],
    };
    if (!dryRun) {
      result.databaseIds = await this.write(database, tables, moves);
    }
    return result;
  }

  /**
   * Checks that no table of the base has moved yet, and returns the Outline
   * databases of its tables, deleted ones included.
   */
  private async databasesToSwitch(
    database: Database,
    tables: TeableTableMetaVo[]
  ): Promise<Database[]> {
    if (!tables.some((table) => table.id === database.externalTableId)) {
      throw NotFoundError(
        "The table of this database is not in its Teable base"
      );
    }
    const tableIds = tables.map((table) => table.id);

    const stored = (await this.deps.store.base(database.externalBaseId)).filter(
      (snapshot) => tableIds.includes(snapshot.table.id)
    );
    if (stored.length) {
      throw ValidationError(
        `Already in the Outline engine: ${stored.map((snapshot) => snapshot.table.name).join(", ")}`
      );
    }

    const databases = await Database.findAll({
      attributes: ["id", "engine", "externalTableId"],
      where: { teamId: database.teamId, externalTableId: tableIds },
      paranoid: false,
    });
    const switched = databases.filter((item) => item.engine !== "teable");
    if (switched.length) {
      throw ValidationError(
        `Databases of this base are already on another engine: ${switched.map((item) => item.id).join(", ")}`
      );
    }
    return databases;
  }

  private async read(
    baseId: string,
    tables: TeableTableMetaVo[]
  ): Promise<TeableTableRead[]> {
    const { source } = this.deps;
    const read: TeableTableRead[] = [];
    for (const meta of tables) {
      read.push({
        meta,
        fields: await source.fields(baseId, meta.id),
        views: await source.views(baseId, meta.id),
        records: await source.records(baseId, meta.id),
      });
    }
    checkLinksStayInBase(read, new Set(tables.map((table) => table.id)));
    return read;
  }

  /**
   * Creates the tables in the store, then switches the databases, unless
   * Teable changed since it was read; a failure removes the created tables.
   *
   * @returns the ids of the switched databases.
   */
  private async write(
    database: Database,
    tables: TeableTableMetaVo[],
    moves: TableMove[]
  ): Promise<string[]> {
    const { source, store } = this.deps;
    const tableIds = tables.map((table) => table.id);
    const created: string[] = [];
    try {
      for (const move of moves) {
        await store.createTable({
          table: move.table,
          fields: move.fields,
          views: move.views,
          records: move.records,
        });
        created.push(move.table.id);
      }

      const changed = changedTables(
        tables,
        await source.tables(database.externalBaseId)
      );
      if (changed.length) {
        throw ValidationError(
          `The base changed in Teable during the move (${changed.join(", ")}): nothing was moved, run it again`
        );
      }

      return await sequelize.transaction(async (transaction) => {
        const [, rows] = await Database.update(
          { engine: "outline" },
          {
            where: {
              teamId: database.teamId,
              engine: "teable",
              externalTableId: tableIds,
            },
            paranoid: false,
            returning: true,
            transaction,
          }
        );
        return rows.map((row) => row.id);
      });
    } catch (err) {
      await this.removeTables(created);
      throw err;
    }
  }

  private async tableMove(
    run: MoveRun,
    teamId: string,
    { meta, fields, views, records }: TeableTableRead
  ): Promise<TableMove> {
    const stored = fields.filter(isStoredField);
    const orders = run.dryRun
      ? new Map<string, Record<string, number>>()
      : await this.viewOrders(run.baseId, meta.id, fields, views);
    const before = run.attachments.total;

    const rows: EngineRecordRow[] = [];
    for (const [index, record] of records.entries()) {
      rows.push(
        await this.recordRow(run, meta.id, stored, record, index, orders)
      );
    }

    return {
      table: { id: meta.id, baseId: run.baseId, teamId, name: meta.name },
      fields: fields.map((field, index) => fieldRow(meta.id, field, index)),
      views: views.map((view, index) => viewRow(meta.id, view, index)),
      records: rows,
      attachments: run.attachments.total - before,
    };
  }

  private async recordRow(
    run: MoveRun,
    tableId: string,
    fields: TeableField[],
    record: TeableRecord,
    index: number,
    orders: Map<string, Record<string, number>>
  ): Promise<EngineRecordRow> {
    const cells: Record<string, DatabaseCellValue> = {};
    for (const field of fields) {
      const value = await this.cell(run, field, record.fields[field.id]);
      if (value !== undefined) {
        cells[field.id] = value;
      }
    }
    const createdTime = record.createdTime ?? new Date().toISOString();
    return {
      id: record.id,
      tableId,
      cells,
      autoNumber: record.autoNumber ?? index + 1,
      orders: orders.get(record.id) ?? {},
      createdTime,
      lastModifiedTime: record.lastModifiedTime ?? createdTime,
      createdBy: run.people.authorOf(record.createdBy),
      lastModifiedBy: run.people.authorOf(record.lastModifiedBy),
    };
  }

  /** A stored cell as the Outline engine keeps it; undefined for an empty one. */
  private async cell(
    run: MoveRun,
    field: TeableField,
    raw: TeableCellValue | undefined
  ): Promise<DatabaseCellValue | undefined> {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    switch (field.type) {
      case DatabaseFieldType.User: {
        const people = objectsOf(raw).flatMap((item) => {
          const value = run.people.personOf(item);
          return value ? [value] : [];
        });
        if (!people.length) {
          return undefined;
        }
        return Array.isArray(raw) ? people : people[0];
      }
      case DatabaseFieldType.Link: {
        const links: DatabaseLinkValue[] = objectsOf(raw).flatMap((item) =>
          item.id ? [{ id: item.id }] : []
        );
        return links.length ? links : undefined;
      }
      case DatabaseFieldType.Attachment: {
        const files: DatabaseAttachmentValue[] = [];
        for (const item of objectsOf(raw)) {
          files.push(await this.attachment(run, item));
        }
        return files.length ? files : undefined;
      }
      default: {
        const value = this.deps.mapper.cell(raw);
        return Array.isArray(value) && !value.length ? undefined : value;
      }
    }
  }

  /** Copies the file of an attachment into Outline; a failure keeps Teable's link. */
  private async attachment(
    run: MoveRun,
    item: TeableObjectValue
  ): Promise<DatabaseAttachmentValue> {
    run.attachments.total += 1;
    const teableValue = this.teableAttachment(item);
    if (run.dryRun) {
      return teableValue;
    }

    const { source, files } = this.deps;
    try {
      if (!item.presignedUrl) {
        throw new Error("Teable gave no URL for the file");
      }
      const file = await source.download(item.presignedUrl, files.maxSize);
      const stored = await files.store({
        sourceId: item.token ?? item.path ?? item.id ?? item.presignedUrl,
        name: item.name || "file",
        buffer: file.buffer,
        contentType: item.mimetype || file.contentType,
      });
      run.attachments.copied += 1;
      const mimetype = item.mimetype || file.contentType;
      return {
        id: stored.id,
        name: item.name ?? "",
        mimetype,
        size: item.size ?? file.buffer.length,
        ...(item.width !== undefined ? { width: item.width } : {}),
        ...(item.height !== undefined ? { height: item.height } : {}),
        url: stored.url,
        ...(mimetype.startsWith("image/") ? { thumbnailUrl: stored.url } : {}),
        path: stored.key,
      };
    } catch (err) {
      run.attachments.failed += 1;
      Logger.warn("Could not copy a Teable attachment into Outline", {
        attachmentId: item.id,
        error: toError(err).message,
      });
      return teableValue;
    }
  }

  /** The attachment as the Teable engine shows it, its link pointing at Teable. */
  private teableAttachment(item: TeableObjectValue): DatabaseAttachmentValue {
    const mapped = this.deps.mapper.cell([item]);
    if (Array.isArray(mapped)) {
      for (const value of mapped) {
        if (typeof value === "object" && "mimetype" in value) {
          return value;
        }
      }
    }
    return {
      id: item.id ?? "",
      name: item.name ?? "",
      mimetype: item.mimetype ?? "",
      size: item.size ?? 0,
    };
  }

  /** Each record's position in each view that shows records: 1, 2, 3… in the view's own order. */
  private async viewOrders(
    baseId: string,
    tableId: string,
    fields: TeableField[],
    views: TeableView[]
  ): Promise<Map<string, Record<string, number>>> {
    const orders = new Map<string, Record<string, number>>();
    const fieldId = (fields.find((field) => field.isPrimary) ?? fields[0])?.id;
    if (!fieldId) {
      return orders;
    }
    for (const view of views) {
      if (!DatabaseEngineMover.orderedViewTypes.has(view.type)) {
        continue;
      }
      const ids = await this.deps.source.viewRecordIds(
        baseId,
        tableId,
        view.id,
        fieldId
      );
      ids.forEach((recordId, index) => {
        const positions = orders.get(recordId) ?? {};
        positions[view.id] = index + 1;
        orders.set(recordId, positions);
      });
    }
    return orders;
  }

  /**
   * Resolves the Teable users met in the base to engine users: the email of a
   * Teable user comes from the cells that show it, the base's collaborators
   * and the service account; the engine's directory then names the Outline
   * member with that email, or keeps an `email:` id.
   */
  private async people(
    teamId: string,
    baseId: string,
    tables: TeableTableRead[]
  ): Promise<PeopleIndex> {
    const known = new Map<string, { email: string; name: string }>();
    for (const user of await this.deps.source.users(baseId)) {
      known.set(user.id, { email: user.email.toLowerCase(), name: user.name });
    }
    for (const { fields, records } of tables) {
      const userFields = fields.filter(
        (field) => field.type === DatabaseFieldType.User
      );
      for (const record of records) {
        for (const field of userFields) {
          for (const item of objectsOf(record.fields[field.id])) {
            if (item.id && item.email) {
              known.set(item.id, {
                email: item.email.toLowerCase(),
                name: item.title ?? item.email,
              });
            }
          }
        }
      }
    }

    const { users } = this.deps;
    const engineIds = await users.ensureUsers(teamId, [...known.values()]);
    const members = await users.describe(teamId, [
      ...new Set(engineIds.values()),
    ]);
    const personFor = (email: string, title: string): DatabaseUserValue => {
      const id = engineIds.get(email) ?? emailUserId(email);
      const member = id === emailUserId(email) ? undefined : members.get(id);
      return member ?? { id, title, email };
    };

    const unresolved = new Set<string>();
    return {
      unresolved,
      personOf(item) {
        const email = (
          item.email ?? (item.id ? known.get(item.id)?.email : undefined)
        )?.toLowerCase();
        if (!email) {
          if (item.id) {
            unresolved.add(item.id);
          }
          return undefined;
        }
        return personFor(email, item.title ?? email);
      },
      authorOf(teableUserId) {
        if (!teableUserId) {
          return null;
        }
        const user = known.get(teableUserId);
        if (!user) {
          unresolved.add(teableUserId);
          return null;
        }
        return personFor(user.email, user.name).id;
      },
    };
  }

  /** Removes the tables a failed move created, so that it can run again. */
  private async removeTables(tableIds: string[]) {
    for (const tableId of tableIds) {
      try {
        await this.deps.store.deleteTable(tableId);
      } catch (err) {
        Logger.error(
          "Could not remove a table of a failed move from the Outline engine",
          toError(err),
          { tableId }
        );
      }
    }
  }
}

interface TeableTableRead {
  meta: TeableTableMetaVo;
  fields: TeableField[];
  views: TeableView[];
  records: TeableRecord[];
}

interface TableMove {
  table: Omit<EngineTableRow, "version">;
  fields: EngineFieldRow[];
  views: EngineViewRow[];
  records: EngineRecordRow[];
  attachments: number;
}

interface MoveRun {
  dryRun: boolean;
  baseId: string;
  people: PeopleIndex;
  attachments: DatabaseEngineMoveResult["attachments"];
}

interface PeopleIndex {
  /** Teable user ids no email is known for. */
  unresolved: Set<string>;
  /** The engine value of a person of a cell, or undefined when unknown. */
  personOf(item: TeableObjectValue): DatabaseUserValue | undefined;
  /** The engine user id of a record's author, or null when unknown. */
  authorOf(teableUserId: string | undefined): string | null;
}

/** Options Teable keeps for its own storage of links, meaningless elsewhere. */
const teableStorageOptions = [
  "fkHostTableName",
  "selfKeyName",
  "foreignKeyName",
];

/** Cells Teable stores: not computed, not a lookup, not a button's click count. */
function isStoredField(field: TeableField): boolean {
  return (
    !field.isComputed &&
    !field.isLookup &&
    field.type !== DatabaseFieldType.Button
  );
}

function fieldRow(
  tableId: string,
  field: TeableField,
  order: number
): EngineFieldRow {
  const options: DatabaseFieldOptions = { ...field.options };
  for (const key of teableStorageOptions) {
    Reflect.deleteProperty(options, key);
  }
  return {
    id: field.id,
    tableId,
    name: field.name,
    type: field.type,
    description: field.description ?? null,
    options,
    lookupOptions: field.lookupOptions
      ? {
          foreignTableId: field.lookupOptions.foreignTableId,
          linkFieldId: field.lookupOptions.linkFieldId,
          lookupFieldId: field.lookupOptions.lookupFieldId,
        }
      : null,
    isPrimary: !!field.isPrimary,
    isComputed: !!field.isComputed,
    isLookup: !!field.isLookup,
    cellValueType: field.cellValueType,
    isMultipleCellValue: !!field.isMultipleCellValue,
    order,
  };
}

function viewRow(
  tableId: string,
  view: TeableView,
  index: number
): EngineViewRow {
  return {
    id: view.id,
    tableId,
    name: view.name,
    type: view.type,
    order: view.order ?? index,
    description: view.description ?? null,
    filter: view.filter ?? null,
    sort: view.sort ?? null,
    group: view.group ?? null,
    columnMeta: view.columnMeta ?? {},
    options: view.options ?? {},
    isLocked: !!view.isLocked,
  };
}

/**
 * Refuses a base whose links, lookups or rollups reach a table of another
 * base: that table would not move, and the Outline engine reads a base alone.
 */
function checkLinksStayInBase(
  tables: TeableTableRead[],
  tableIds: Set<string>
) {
  const outside: string[] = [];
  for (const { meta, fields } of tables) {
    for (const field of fields) {
      const foreignTableId =
        field.lookupOptions?.foreignTableId ?? field.options?.foreignTableId;
      if (foreignTableId && !tableIds.has(foreignTableId)) {
        outside.push(`${meta.name} › ${field.name}`);
      }
    }
  }
  if (outside.length) {
    throw ValidationError(
      `These fields reach a table of another base, which would not move: ${outside.join(", ")}`
    );
  }
}

/** Names of the tables added, removed or changed between two listings of a base. */
function changedTables(
  before: TeableTableMetaVo[],
  after: TeableTableMetaVo[]
): string[] {
  const previous = new Map(before.map((table) => [table.id, table]));
  const changed = after.filter(
    (table) =>
      previous.get(table.id)?.lastModifiedTime !== table.lastModifiedTime
  );
  const current = new Set(after.map((table) => table.id));
  const removed = before.filter((table) => !current.has(table.id));
  return [...changed, ...removed].map((table) => table.name);
}

function objectsOf(value: TeableCellValue | undefined): TeableObjectValue[] {
  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }
  const items = Array.isArray(value) ? value : [value];
  return items.filter(
    (item): item is TeableObjectValue =>
      typeof item === "object" && item !== null
  );
}

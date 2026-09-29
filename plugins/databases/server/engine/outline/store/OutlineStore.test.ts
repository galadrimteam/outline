import { DatabaseFieldType } from "@shared/databases/types";
import { buildTeam } from "@server/test/factories";
import { generateEngineId } from "../ids";
import type {
  EngineFieldRow,
  EngineRecordRow,
  EngineViewRow,
  TableSnapshot,
} from "../types";
import { InMemoryOutlineStore } from "./InMemoryOutlineStore";
import type { OutlineStore } from "./OutlineStore";
import { SequelizeOutlineStore } from "./SequelizeOutlineStore";

const stores: [string, () => OutlineStore][] = [
  ["InMemoryOutlineStore", () => new InMemoryOutlineStore()],
  ["SequelizeOutlineStore", () => new SequelizeOutlineStore()],
];

describe.each(stores)("%s", (_name, makeStore) => {
  let store: OutlineStore;
  let teamId: string;
  let ids: Ids;

  beforeEach(async () => {
    store = makeStore();
    teamId = (await buildTeam()).id;
    ids = newIds();
  });

  async function createTable(
    records: Partial<EngineRecordRow>[] = []
  ): Promise<TableSnapshot> {
    const tableId = generateEngineId("tbl");
    return store.createTable({
      table: {
        id: tableId,
        baseId: generateEngineId("bse"),
        teamId,
        name: "Tasks",
      },
      fields: [
        field(tableId, ids.name, "Name", 0, true),
        field(tableId, ids.status, "Status", 1),
      ],
      views: [view(tableId, ids.grid, 0), view(tableId, ids.board, 1)],
      records: records.map((record) => row(tableId, record)),
    });
  }

  it("creates a table with its fields, views and numbered records", async () => {
    const created = await createTable([
      { cells: { [ids.name]: "One" } },
      { cells: { [ids.name]: "Two", [ids.status]: null } },
    ]);

    const snapshot = await store.table(created.table.id);
    expect(snapshot.table).toMatchObject({ name: "Tasks", teamId, version: 1 });
    expect(snapshot.fields.map((item) => item.id)).toEqual([
      ids.name,
      ids.status,
    ]);
    expect(snapshot.views.map((item) => item.id)).toEqual([
      ids.grid,
      ids.board,
    ]);
    expect(
      snapshot.records.map((record) => [record.autoNumber, record.cells])
    ).toEqual([
      [1, { [ids.name]: "One" }],
      [2, { [ids.name]: "Two" }],
    ]);
    expect(await store.base(created.table.baseId)).toHaveLength(1);
  });

  it("throws NotFoundError for an unknown table", async () => {
    await expect(store.table("tblUnknown")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      store.apply([{ tableId: "tblUnknown", name: "x" }], null, new Date())
    ).rejects.toMatchObject({ status: 404 });
  });

  it("applies inserts, updates and deletes and bumps the version once", async () => {
    const created = await createTable([
      { id: ids.a, cells: { [ids.name]: "A", [ids.status]: "To do" } },
      { id: ids.b, cells: { [ids.name]: "B" } },
    ]);
    const tableId = created.table.id;
    const now = new Date("2026-09-28T10:00:00.000Z");

    await store.apply(
      [
        {
          tableId,
          name: "Renamed",
          records: {
            insert: [row(tableId, { id: ids.c, cells: { [ids.name]: "C" } })],
            update: [
              { id: ids.a, cells: { [ids.status]: null, [ids.name]: "A2" } },
              { id: ids.b, orders: { [ids.board]: 0.5 } },
            ],
          },
        },
        { tableId, records: { delete: [ids.b] } },
      ],
      "user-1",
      now
    );

    const snapshot = await store.table(tableId);
    expect(snapshot.table).toMatchObject({ name: "Renamed", version: 2 });
    expect(snapshot.records.map((record) => record.id)).toEqual([ids.a, ids.c]);
    const [a, c] = snapshot.records;
    expect(a.cells).toEqual({ [ids.name]: "A2" });
    expect(a.lastModifiedBy).toBe("user-1");
    expect(a.lastModifiedTime).toBe(now.toISOString());
    expect(c.autoNumber).toBe(3);
  });

  it("stamps a record only when its cells change", async () => {
    const created = await createTable([
      { id: ids.a, cells: { [ids.name]: "A" } },
    ]);
    const before = created.records[0];

    await store.apply(
      [
        {
          tableId: created.table.id,
          records: { update: [{ id: ids.a, orders: { [ids.board]: 3 } }] },
        },
      ],
      "user-2",
      new Date("2030-01-01T00:00:00.000Z")
    );

    const [record] = (await store.table(created.table.id)).records;
    expect(record.orders).toEqual({ [ids.board]: 3 });
    expect(record.lastModifiedBy).toBe(before.lastModifiedBy);
    expect(record.lastModifiedTime).toBe(before.lastModifiedTime);
  });

  it("unsets cells, and removes a deleted field's cells and a deleted view's positions", async () => {
    const created = await createTable([
      {
        id: ids.a,
        cells: { [ids.name]: "A", [ids.status]: "Done" },
        orders: { [ids.board]: 2, [ids.grid]: 1 },
      },
      { id: ids.b, cells: { [ids.name]: "B", [ids.status]: "To do" } },
    ]);
    const tableId = created.table.id;

    await store.apply(
      [
        {
          tableId,
          records: { update: [{ id: ids.b, unsetFieldIds: [ids.name] }] },
        },
      ],
      null,
      new Date()
    );
    await store.apply(
      [
        {
          tableId,
          fields: {
            upsert: [
              { ...created.fields[0], name: "Title" },
              field(tableId, ids.extra, "New", 5),
            ],
            delete: [ids.status],
          },
          views: { delete: [ids.board] },
        },
      ],
      null,
      new Date()
    );

    const snapshot = await store.table(tableId);
    expect(snapshot.fields.map((item) => [item.id, item.name])).toEqual([
      [ids.name, "Title"],
      [ids.extra, "New"],
    ]);
    expect(snapshot.views.map((item) => item.id)).toEqual([ids.grid]);
    expect(
      snapshot.records.map((record) => [record.cells, record.orders])
    ).toEqual([
      [{ [ids.name]: "A" }, { [ids.grid]: 1 }],
      [{}, {}],
    ]);
  });

  it("keeps a record's history, newest first, a page at a time", async () => {
    const created = await createTable([
      { id: ids.a, cells: { [ids.name]: "A" } },
    ]);
    const tableId = created.table.id;
    for (const [index, name] of ["B", "C", "D"].entries()) {
      const createdAt = new Date(
        Date.UTC(2026, 8, 28, 10, index)
      ).toISOString();
      await store.apply(
        [
          {
            tableId,
            records: { update: [{ id: ids.a, cells: { [ids.name]: name } }] },
            history: [
              {
                id: `his${index}`,
                tableId,
                recordId: ids.a,
                fieldId: ids.name,
                before: index ? ["B", "C"][index - 1] : "A",
                after: name,
                actorId: "user-1",
                createdAt,
              },
            ],
          },
        ],
        "user-1",
        new Date(createdAt)
      );
    }

    const first = await store.history(tableId, ids.a, undefined, 2);
    expect(first.entries.map((entry) => entry.after)).toEqual(["D", "C"]);
    expect(first.nextCursor).toBeTruthy();
    const second = await store.history(
      tableId,
      ids.a,
      first.nextCursor ?? undefined,
      2
    );
    expect(second.entries.map((entry) => [entry.before, entry.after])).toEqual([
      ["A", "B"],
    ]);
    expect(second.nextCursor).toBeNull();

    await store.apply(
      [{ tableId, records: { delete: [ids.a] } }],
      null,
      new Date()
    );
    expect((await store.history(tableId, ids.a)).entries).toEqual([]);
  });

  it("deletes a table", async () => {
    const created = await createTable([{ cells: { [ids.name]: "A" } }]);
    await store.deleteTable(created.table.id);
    await expect(store.table(created.table.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("SequelizeOutlineStore cache", () => {
  let teamId: string;
  let ids: Ids;

  beforeEach(async () => {
    teamId = (await buildTeam()).id;
    ids = newIds();
  });

  async function createTable(store: OutlineStore) {
    const tableId = generateEngineId("tbl");
    return store.createTable({
      table: {
        id: tableId,
        baseId: generateEngineId("bse"),
        teamId,
        name: "Tasks",
      },
      fields: [field(tableId, ids.name, "Name", 0, true)],
      views: [view(tableId, ids.grid, 0)],
      records: [
        row(tableId, {
          id: generateEngineId("rec"),
          cells: { [ids.name]: "A" },
        }),
        row(tableId, {
          id: generateEngineId("rec"),
          cells: { [ids.name]: "B" },
        }),
      ],
    });
  }

  it("serves an unchanged table from the cache", async () => {
    const store = new SequelizeOutlineStore();
    const created = await createTable(store);
    const first = await store.table(created.table.id);
    const second = await store.table(created.table.id);
    expect(second).toBe(first);
  });

  it("reloads a table another process wrote", async () => {
    const reader = new SequelizeOutlineStore();
    const writer = new SequelizeOutlineStore();
    const created = await createTable(writer);
    const cached = await reader.table(created.table.id);

    await writer.apply(
      [
        {
          tableId: created.table.id,
          records: {
            update: [
              { id: cached.records[0].id, cells: { [ids.name]: "Changed" } },
            ],
          },
        },
      ],
      null,
      new Date()
    );

    const fresh = await reader.table(created.table.id);
    expect(fresh).not.toBe(cached);
    expect(fresh.records[0].cells[ids.name]).toBe("Changed");
  });

  it("patches its own snapshot after a write, as a reload would read it", async () => {
    const store = new SequelizeOutlineStore();
    const created = await createTable(store);
    const tableId = created.table.id;
    await store.table(tableId);

    await store.apply(
      [
        {
          tableId,
          name: "Renamed",
          records: {
            insert: [
              row(tableId, {
                id: generateEngineId("rec"),
                cells: { [ids.name]: "C" },
              }),
            ],
            update: [
              {
                id: created.records[0].id,
                cells: { [ids.name]: "A2" },
                orders: { [ids.grid]: 9 },
              },
            ],
            delete: [created.records[1].id],
          },
          fields: { upsert: [field(tableId, ids.extra, "Extra", 3)] },
        },
      ],
      "user-1",
      new Date()
    );

    const patched = await store.table(tableId);
    const reloaded = await new SequelizeOutlineStore().table(tableId);
    expect(patched).toEqual(reloaded);
    expect(patched.records.map((record) => record.cells[ids.name])).toEqual([
      "A2",
      "C",
    ]);
  });

  it("reloads after a field deletion that cleared cells in every record", async () => {
    const store = new SequelizeOutlineStore();
    const created = await createTable(store);
    await store.table(created.table.id);
    await store.apply(
      [
        {
          tableId: created.table.id,
          fields: { upsert: [field(created.table.id, ids.extra, "X", 2)] },
        },
      ],
      null,
      new Date()
    );
    await store.apply(
      [
        {
          tableId: created.table.id,
          records: {
            update: [
              { id: created.records[0].id, cells: { [ids.extra]: "x" } },
            ],
          },
        },
      ],
      null,
      new Date()
    );
    await store.apply(
      [{ tableId: created.table.id, fields: { delete: [ids.extra] } }],
      null,
      new Date()
    );

    const snapshot = await store.table(created.table.id);
    expect(snapshot.records[0].cells).toEqual({ [ids.name]: "A" });
    expect(snapshot.table.version).toBe(4);
  });
});

interface Ids {
  name: string;
  status: string;
  extra: string;
  grid: string;
  board: string;
  a: string;
  b: string;
  c: string;
}

function newIds(): Ids {
  return {
    name: generateEngineId("fld"),
    status: generateEngineId("fld"),
    extra: generateEngineId("fld"),
    grid: generateEngineId("viw"),
    board: generateEngineId("viw"),
    a: generateEngineId("rec"),
    b: generateEngineId("rec"),
    c: generateEngineId("rec"),
  };
}

function field(
  tableId: string,
  id: string,
  name: string,
  order: number,
  isPrimary = false
): EngineFieldRow {
  return {
    id,
    tableId,
    name,
    type: isPrimary
      ? DatabaseFieldType.SingleLineText
      : DatabaseFieldType.SingleSelect,
    description: null,
    options: isPrimary
      ? {}
      : { choices: [{ name: "To do", color: "grayBright" }] },
    lookupOptions: null,
    isPrimary,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
    order,
  };
}

function view(tableId: string, id: string, order: number): EngineViewRow {
  return {
    id,
    tableId,
    name: id,
    type: order ? "kanban" : "grid",
    order,
    description: null,
    filter: null,
    sort: null,
    group: null,
    columnMeta: {},
    options: {},
    isLocked: false,
  };
}

function row(
  tableId: string,
  record: Partial<EngineRecordRow>
): EngineRecordRow {
  const now = new Date("2026-09-01T00:00:00.000Z").toISOString();
  return {
    id: record.id ?? generateEngineId("rec"),
    tableId,
    cells: record.cells ?? {},
    autoNumber: record.autoNumber ?? 0,
    orders: record.orders ?? {},
    createdTime: record.createdTime ?? now,
    lastModifiedTime: record.lastModifiedTime ?? now,
    createdBy: record.createdBy ?? "creator",
    lastModifiedBy: record.lastModifiedBy ?? "creator",
  };
}

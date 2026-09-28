import { http, HttpResponse } from "msw";
import { DatabaseFieldType } from "@shared/databases/types";
import { Attachment, Database } from "@server/models";
import type { User } from "@server/models";
import { buildAdmin, buildDatabase, buildUser } from "@server/test/factories";
import { server } from "@server/test/msw";
import { InMemoryOutlineStore } from "../engine/outline/store/InMemoryOutlineStore";
import { OutlineUserDirectory } from "../engine/outline/OutlineUserDirectory";
import { TeableBaseReader } from "../engine/teable/TeableBaseReader";
import { TeableClient } from "../engine/teable/TeableClient";
import { TeableIdentity } from "../engine/teable/TeableIdentity";
import { TeableMapper } from "../engine/teable/TeableMapper";
import { OutlineAttachmentFileStore } from "../utils/DatabaseFileStore";
import { DatabaseEngineMover } from "./databaseEngineMover";

const teable = "http://teable.test";
const publicTeable = "https://teable.example.com";
const baseId = "bseMove";

/** Two linked tables: Tasks (with an Outline database) and Projects (without). */
function teableFields(adaEmail: string) {
  return {
    tblTasks: [
      {
        id: "fldTitle",
        name: "Title",
        type: "singleLineText",
        options: {},
        isPrimary: true,
        cellValueType: "string",
      },
      {
        id: "fldOwner",
        name: "Owner",
        type: "user",
        options: { isMultiple: false, shouldNotify: true },
        cellValueType: "string",
      },
      {
        id: "fldProject",
        name: "Project",
        type: "link",
        description: "Where the task belongs",
        options: {
          relationship: "manyMany",
          foreignTableId: "tblProjects",
          lookupFieldId: "fldProjName",
          symmetricFieldId: "fldTasks",
          fkHostTableName: "junction_fldProject",
          selfKeyName: "__fk_self",
          foreignKeyName: "__fk_foreign",
        },
        cellValueType: "string",
        isMultipleCellValue: true,
      },
      {
        id: "fldProjectName",
        name: "Project name",
        type: "singleLineText",
        options: {},
        isLookup: true,
        isComputed: true,
        lookupOptions: {
          foreignTableId: "tblProjects",
          linkFieldId: "fldProject",
          lookupFieldId: "fldProjName",
          fkHostTableName: "junction_fldProject",
        },
        cellValueType: "string",
        isMultipleCellValue: true,
      },
      {
        id: "fldFiles",
        name: "Files",
        type: "attachment",
        options: {},
        cellValueType: "string",
        isMultipleCellValue: true,
      },
      {
        id: "fldTags",
        name: "Tags",
        type: "multipleSelect",
        options: { choices: [{ id: "choA", name: "A", color: "blue" }] },
        cellValueType: "string",
        isMultipleCellValue: true,
      },
      {
        id: "fldCreated",
        name: "Created",
        type: "createdTime",
        options: {},
        isComputed: true,
        cellValueType: "dateTime",
      },
    ],
    tblProjects: [
      {
        id: "fldProjName",
        name: "Name",
        type: "singleLineText",
        options: {},
        isPrimary: true,
        cellValueType: "string",
      },
      {
        id: "fldTasks",
        name: "Tasks",
        type: "link",
        options: {
          relationship: "manyMany",
          foreignTableId: "tblTasks",
          lookupFieldId: "fldTitle",
          symmetricFieldId: "fldProject",
        },
        cellValueType: "string",
        isMultipleCellValue: true,
      },
      {
        id: "fldTaskCount",
        name: "Task count",
        type: "rollup",
        options: { expression: "countall({values})" },
        isComputed: true,
        lookupOptions: {
          foreignTableId: "tblTasks",
          linkFieldId: "fldTasks",
          lookupFieldId: "fldTitle",
        },
        cellValueType: "number",
      },
    ],
    adaCell: {
      id: "usrAda",
      title: "Ada (Teable)",
      email: adaEmail.toUpperCase(),
      avatarUrl: "/api/attachments/read/public/avatar/usrAda",
    },
  };
}

const teableViews = {
  tblTasks: [
    {
      id: "viwBoard",
      name: "Board",
      type: "kanban",
      order: 1,
      options: { stackFieldId: "fldOwner" },
      columnMeta: { fldTitle: { order: 0, visible: true } },
      filter: {
        conjunction: "and",
        filterSet: [
          { fieldId: "fldTags", operator: "isNotEmpty", value: null },
        ],
      },
      isLocked: true,
    },
    {
      id: "viwGrid",
      name: "Grid",
      type: "grid",
      order: 0,
      sort: { sortObjs: [{ fieldId: "fldTitle", order: "asc" }] },
      columnMeta: { fldTitle: { order: 0, width: 300 } },
    },
    { id: "viwForm", name: "Form", type: "form", order: 2, columnMeta: {} },
  ],
  tblProjects: [
    { id: "viwProjects", name: "Projects", type: "grid", order: 0 },
  ],
};

interface TeableSetup {
  /** Record ids per view read with ignoreViewQuery. */
  viewReads: string[];
  downloads: number;
  tableListings: number;
}

/**
 * Serves a Teable base through msw.
 *
 * @param adaEmail the email of the Outline member shown in person cells.
 * @param options.changeDuringMove bumps a table's modification time after the first listing.
 * @param options.failDownloads answers 500 to file downloads.
 * @returns what Teable was asked.
 */
function serveTeable(
  adaEmail: string,
  options: { changeDuringMove?: boolean; failDownloads?: boolean } = {}
): TeableSetup {
  const fields = teableFields(adaEmail);
  const seen: TeableSetup = { viewReads: [], downloads: 0, tableListings: 0 };
  const records = {
    tblTasks: [
      {
        id: "recA",
        autoNumber: 1,
        createdTime: "2026-01-01T10:00:00.000Z",
        lastModifiedTime: "2026-01-02T10:00:00.000Z",
        createdBy: "usrAda",
        lastModifiedBy: "usrGhost",
        fields: {
          fldTitle: "Write the spec",
          fldOwner: fields.adaCell,
          fldProject: [{ id: "recP1", title: "Apollo" }],
          fldProjectName: ["Apollo"],
          fldFiles: [
            {
              id: "actSpec",
              name: "spec.txt",
              path: "table/spec",
              token: "tokSpec",
              size: 5,
              mimetype: "text/plain",
              presignedUrl: "/api/attachments/read/private/table/spec?token=t",
            },
          ],
          fldTags: ["A"],
          fldCreated: "2026-01-01T10:00:00.000Z",
        },
      },
      {
        id: "recB",
        autoNumber: 2,
        createdTime: "2026-01-03T10:00:00.000Z",
        createdBy: "usrBob",
        fields: {
          fldTitle: "Review",
          fldOwner: { id: "usrBob", title: "Bob", email: "bob@external.com" },
          fldProject: [
            { id: "recP1", title: "Apollo" },
            { id: "recP2", title: "Gemini" },
          ],
          fldTags: [],
        },
      },
      {
        id: "recC",
        autoNumber: 3,
        createdTime: "2026-01-04T10:00:00.000Z",
        createdBy: "usrService",
        fields: { fldTitle: "Ship" },
      },
    ],
    tblProjects: [
      {
        id: "recP1",
        autoNumber: 1,
        createdTime: "2026-01-01T09:00:00.000Z",
        createdBy: "usrAda",
        fields: {
          fldProjName: "Apollo",
          fldTasks: [
            { id: "recA", title: "Write the spec" },
            { id: "recB", title: "Review" },
          ],
          fldTaskCount: 2,
        },
      },
      {
        id: "recP2",
        autoNumber: 2,
        createdTime: "2026-01-01T09:30:00.000Z",
        createdBy: "usrAda",
        fields: {
          fldProjName: "Gemini",
          fldTasks: [{ id: "recB", title: "Review" }],
          fldTaskCount: 1,
        },
      },
    ],
  };
  const viewOrders: Record<string, string[]> = {
    viwGrid: ["recC", "recA", "recB"],
    viwBoard: ["recB", "recC", "recA"],
    viwProjects: ["recP2", "recP1"],
  };

  server.use(
    http.post(`${teable}/api/galadrim/token`, () =>
      HttpResponse.json({ userId: "usrService", token: "token-1" })
    ),
    http.post(`${teable}/api/galadrim/users/ensure`, () =>
      HttpResponse.json({
        users: [{ email: "outline@galadrim.local", id: "usrService" }],
      })
    ),
    http.get(`${teable}/api/base/${baseId}/table`, () => {
      seen.tableListings += 1;
      const bumped = options.changeDuringMove && seen.tableListings > 1;
      return HttpResponse.json([
        {
          id: "tblTasks",
          name: "Tasks",
          lastModifiedTime: bumped
            ? "2026-02-01T00:00:00.000Z"
            : "2026-01-05T00:00:00.000Z",
        },
        {
          id: "tblProjects",
          name: "Projects",
          lastModifiedTime: "2026-01-05T00:00:00.000Z",
        },
      ]);
    }),
    http.get(`${teable}/api/base/${baseId}/collaborators`, () =>
      HttpResponse.json({
        collaborators: [
          {
            type: "user",
            userId: "usrAda",
            userName: "Ada",
            email: adaEmail,
          },
        ],
        total: 1,
      })
    ),
    http.get(`${teable}/api/table/:tableId/field`, ({ params }) =>
      HttpResponse.json(
        fields[String(params.tableId) as "tblTasks" | "tblProjects"]
      )
    ),
    http.get(`${teable}/api/table/:tableId/view`, ({ params }) =>
      HttpResponse.json(
        teableViews[String(params.tableId) as "tblTasks" | "tblProjects"]
      )
    ),
    http.get(`${teable}/api/table/:tableId/record`, ({ params, request }) => {
      const url = new URL(request.url);
      const tableId = String(params.tableId) as "tblTasks" | "tblProjects";
      const viewId = url.searchParams.get("viewId");
      if (viewId) {
        expect(url.searchParams.get("ignoreViewQuery")).toEqual("true");
        seen.viewReads.push(viewId);
        return HttpResponse.json({
          records: viewOrders[viewId].map((id) => ({ id, fields: {} })),
        });
      }
      expect(url.searchParams.get("fieldKeyType")).toEqual("id");
      return HttpResponse.json({ records: records[tableId] });
    }),
    http.get(`${teable}/api/attachments/read/private/table/spec`, () => {
      seen.downloads += 1;
      return options.failDownloads
        ? new HttpResponse(null, { status: 500 })
        : new HttpResponse("hello", {
            headers: { "Content-Type": "text/plain" },
          });
    })
  );
  return seen;
}

function buildMover(store: InMemoryOutlineStore, owner: User) {
  const identity = new TeableIdentity(new TeableClient(teable), "secret");
  return new DatabaseEngineMover({
    source: new TeableBaseReader(
      new TeableClient(teable),
      identity,
      teable,
      publicTeable
    ),
    store,
    files: new OutlineAttachmentFileStore(owner),
    users: new OutlineUserDirectory(),
    mapper: new TeableMapper(publicTeable),
  });
}

async function setup(options: Parameters<typeof serveTeable>[1] = {}) {
  const admin = await buildAdmin();
  const ada = await buildUser({
    teamId: admin.teamId,
    name: "Ada Lovelace",
    email: `ada-${admin.teamId.slice(0, 8)}@example.com`,
  });
  const database = await buildDatabase({
    teamId: admin.teamId,
    externalBaseId: baseId,
    externalTableId: "tblTasks",
    settings: { viewOverrides: { viwGrid: { cardSize: "large" } } },
  });
  const otherBase = await buildDatabase({ teamId: admin.teamId });
  const store = new InMemoryOutlineStore();
  const seen = serveTeable(ada.email ?? "", options);
  return {
    admin,
    ada,
    database,
    otherBase,
    store,
    seen,
    mover: buildMover(store, admin),
  };
}

describe("DatabaseEngineMover", () => {
  it("moves every table of the base with its ids and switches the databases", async () => {
    const { ada, database, otherBase, store, mover } = await setup();

    const result = await mover.move({ database, dryRun: false });

    expect(result).toEqual({
      baseId,
      dryRun: false,
      tables: [
        {
          id: "tblTasks",
          name: "Tasks",
          fields: 7,
          views: 3,
          records: 3,
          attachments: 1,
          databaseIds: [database.id],
        },
        {
          id: "tblProjects",
          name: "Projects",
          fields: 3,
          views: 1,
          records: 2,
          attachments: 0,
          databaseIds: [],
        },
      ],
      databaseIds: [database.id],
      attachments: { total: 1, copied: 1, failed: 0 },
      unresolvedUsers: ["usrGhost"],
      notMoved: ["record history"],
    });

    const tasks = await store.table("tblTasks");
    expect(tasks.table).toMatchObject({
      id: "tblTasks",
      baseId,
      teamId: database.teamId,
      name: "Tasks",
    });
    expect(tasks.fields.map((field) => [field.id, field.order])).toEqual([
      ["fldTitle", 0],
      ["fldOwner", 1],
      ["fldProject", 2],
      ["fldProjectName", 3],
      ["fldFiles", 4],
      ["fldTags", 5],
      ["fldCreated", 6],
    ]);
    const project = tasks.fields.find((field) => field.id === "fldProject");
    expect(project).toMatchObject({
      type: DatabaseFieldType.Link,
      description: "Where the task belongs",
      isMultipleCellValue: true,
    });
    expect(project?.options).toEqual({
      relationship: "manyMany",
      foreignTableId: "tblProjects",
      lookupFieldId: "fldProjName",
      symmetricFieldId: "fldTasks",
    });
    expect(
      tasks.fields.find((field) => field.id === "fldProjectName")
    ).toMatchObject({
      isLookup: true,
      isComputed: true,
      lookupOptions: {
        foreignTableId: "tblProjects",
        linkFieldId: "fldProject",
        lookupFieldId: "fldProjName",
      },
    });
    expect(tasks.views.find((view) => view.id === "viwBoard")).toEqual({
      id: "viwBoard",
      tableId: "tblTasks",
      name: "Board",
      type: "kanban",
      order: 1,
      description: null,
      filter: teableViews.tblTasks[0].filter,
      sort: null,
      group: null,
      columnMeta: { fldTitle: { order: 0, visible: true } },
      options: { stackFieldId: "fldOwner" },
      isLocked: true,
    });

    const byId = new Map(tasks.records.map((record) => [record.id, record]));
    const recA = byId.get("recA");
    expect(recA?.autoNumber).toEqual(1);
    expect(Object.keys(recA?.cells ?? {}).sort()).toEqual([
      "fldFiles",
      "fldOwner",
      "fldProject",
      "fldTags",
      "fldTitle",
    ]);
    expect(recA?.cells.fldOwner).toEqual({
      id: ada.id,
      title: "Ada Lovelace",
      email: ada.email,
    });
    expect(recA?.cells.fldProject).toEqual([{ id: "recP1" }]);
    expect(recA).toMatchObject({
      createdTime: "2026-01-01T10:00:00.000Z",
      lastModifiedTime: "2026-01-02T10:00:00.000Z",
      createdBy: ada.id,
      lastModifiedBy: null,
    });

    const attachment = await Attachment.findOne({
      where: { teamId: database.teamId },
      rejectOnEmpty: true,
    });
    expect(recA?.cells.fldFiles).toEqual([
      {
        id: attachment.id,
        name: "spec.txt",
        mimetype: "text/plain",
        size: 5,
        url: attachment.redirectUrl,
        path: attachment.key,
      },
    ]);

    const recB = byId.get("recB");
    expect(recB?.cells.fldOwner).toEqual({
      id: "email:bob@external.com",
      title: "Bob",
      email: "bob@external.com",
    });
    expect(recB?.cells.fldProject).toEqual([{ id: "recP1" }, { id: "recP2" }]);
    expect(recB?.cells.fldTags).toBeUndefined();
    expect(recB).toMatchObject({
      createdBy: "email:bob@external.com",
      lastModifiedTime: "2026-01-03T10:00:00.000Z",
    });
    expect(byId.get("recC")?.createdBy).toEqual("email:outline@galadrim.local");

    expect(recA?.orders).toEqual({ viwGrid: 2, viwBoard: 3 });
    expect(recB?.orders).toEqual({ viwGrid: 3, viwBoard: 1 });
    expect(byId.get("recC")?.orders).toEqual({ viwGrid: 1, viwBoard: 2 });

    const projects = await store.table("tblProjects");
    expect(
      projects.fields.find((field) => field.id === "fldTaskCount")
    ).toMatchObject({
      type: DatabaseFieldType.Rollup,
      isComputed: true,
      options: { expression: "countall({values})" },
      lookupOptions: {
        foreignTableId: "tblTasks",
        linkFieldId: "fldTasks",
        lookupFieldId: "fldTitle",
      },
    });
    expect(projects.records.map((record) => record.cells)).toEqual([
      { fldProjName: "Apollo", fldTasks: [{ id: "recA" }, { id: "recB" }] },
      { fldProjName: "Gemini", fldTasks: [{ id: "recB" }] },
    ]);
    expect(projects.records.map((record) => record.orders)).toEqual([
      { viwProjects: 2 },
      { viwProjects: 1 },
    ]);

    await database.reload();
    expect(database).toMatchObject({
      engine: "outline",
      externalBaseId: baseId,
      externalTableId: "tblTasks",
      settings: { viewOverrides: { viwGrid: { cardSize: "large" } } },
    });
    await otherBase.reload();
    expect(otherBase.engine).toEqual("teable");
  });

  it("counts what would move without writing, downloading or reading orders", async () => {
    const { database, store, seen, mover } = await setup();

    const result = await mover.move({ database, dryRun: true });

    expect(result).toMatchObject({
      dryRun: true,
      databaseIds: [database.id],
      attachments: { total: 1, copied: 0, failed: 0 },
      unresolvedUsers: ["usrGhost"],
    });
    expect(result.tables.map((table) => table.records)).toEqual([3, 2]);
    expect(await store.base(baseId)).toEqual([]);
    expect(seen.downloads).toEqual(0);
    expect(seen.viewReads).toEqual([]);
    await database.reload();
    expect(database.engine).toEqual("teable");
  });

  it("refuses to move a base twice", async () => {
    const { database, store, mover } = await setup();
    await mover.move({ database, dryRun: false });
    const moved = await Database.findByPk(database.id, { rejectOnEmpty: true });

    await expect(
      mover.move({ database: moved, dryRun: false })
    ).rejects.toThrow(/not on Teable/);
    expect(await store.base(baseId)).toHaveLength(2);
  });

  it("refuses a base a table of which is already in the store", async () => {
    const { database, store, mover } = await setup();
    await store.createTable({
      table: {
        id: "tblProjects",
        baseId,
        teamId: database.teamId,
        name: "Projects",
      },
      fields: [],
      views: [],
    });

    await expect(mover.move({ database, dryRun: true })).rejects.toThrow(
      /Already in the Outline engine: Projects/
    );
  });

  it("leaves nothing behind when the base changed during the move", async () => {
    const { database, store, mover } = await setup({ changeDuringMove: true });

    await expect(mover.move({ database, dryRun: false })).rejects.toThrow(
      /changed in Teable during the move \(Tasks\)/
    );
    expect(await store.base(baseId)).toEqual([]);
    await database.reload();
    expect(database.engine).toEqual("teable");
  });

  it("refuses a base whose links reach a table of another base", async () => {
    const { database, mover } = await setup();
    server.use(
      http.get(`${teable}/api/table/tblProjects/field`, () =>
        HttpResponse.json([
          {
            id: "fldProjName",
            name: "Name",
            type: "singleLineText",
            options: {},
            isPrimary: true,
            cellValueType: "string",
          },
          {
            id: "fldElsewhere",
            name: "Elsewhere",
            type: "link",
            options: { foreignTableId: "tblElsewhere", baseId: "bseOther" },
            cellValueType: "string",
          },
        ])
      )
    );

    await expect(mover.move({ database, dryRun: true })).rejects.toThrow(
      /Projects › Elsewhere/
    );
  });

  it("keeps the Teable link of a file it cannot copy", async () => {
    const { database, store, mover } = await setup({ failDownloads: true });

    const result = await mover.move({ database, dryRun: false });

    expect(result.attachments).toEqual({ total: 1, copied: 0, failed: 1 });
    const tasks = await store.table("tblTasks");
    const recA = tasks.records.find((record) => record.id === "recA");
    expect(recA?.cells.fldFiles).toEqual([
      expect.objectContaining({
        id: "actSpec",
        name: "spec.txt",
        url: `${publicTeable}/api/attachments/read/private/table/spec?token=t`,
      }),
    ]);
  });
});

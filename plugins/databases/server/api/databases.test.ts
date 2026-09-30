import type { Job } from "bull";
import { DatabaseLayout, DatabaseStatusGroup } from "@shared/databases/types";
import { Database, DatabaseAutomation, Document } from "@server/models";
import { BaseTask } from "@server/queues/tasks/base/BaseTask";
import {
  buildAdmin,
  buildCollection,
  buildDatabase,
  buildDocument,
  buildTeam,
  buildUser,
  buildViewer,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { DatabaseEngineMover } from "../commands/databaseEngineMover";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { FakeTeableBase } from "../engine/__mocks__/FakeTeableBase";
import { InMemoryOutlineStore } from "../engine/outline/store/InMemoryOutlineStore";
import { OutlineUserDirectory } from "../engine/outline/OutlineUserDirectory";
import { TeableMapper } from "../engine/teable/TeableMapper";
import env from "../env";
import { setDatabaseEngineMoverFactory } from "../tasks/MoveDatabaseEngineTask";
import { OutlineAttachmentFileStore } from "../utils/DatabaseFileStore";

const server = getTestServer();

let engine: FakeEngine;

beforeEach(() => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
});

afterEach(() => {
  setEngineFactory();
});

describe("#databases.info", () => {
  it("requires authentication", async () => {
    const database = await buildDatabase();
    const res = await server.post("/api/databases.info", {
      body: { id: database.id },
    });
    expect(res.status).toEqual(401);
  });

  it("returns 404 for an unknown database", async () => {
    const user = await buildUser();
    const res = await server.post("/api/databases.info", user, {
      body: { id: "9b5a8b6e-4a9a-4f3a-8d5c-2f4c1d3e7a10" },
    });
    expect(res.status).toEqual(404);
  });

  it("returns 403 to a member of another team", async () => {
    const database = await buildDatabase();
    const user = await buildUser();
    const res = await server.post("/api/databases.info", user, {
      body: { id: database.id },
    });
    expect(res.status).toEqual(403);
    expect(engine.calls).toHaveLength(0);
  });

  it("returns 403 when the anchor collection is private", async () => {
    const team = await buildTeam();
    const collection = await buildCollection({
      teamId: team.id,
      permission: null,
    });
    const database = await buildDatabase({
      teamId: team.id,
      collectionId: collection.id,
    });
    const user = await buildUser({ teamId: team.id });
    const res = await server.post("/api/databases.info", user, {
      body: { id: database.id },
    });
    expect(res.status).toEqual(403);
  });

  it("returns the schema with Outline's overrides merged", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: {
        viewOverrides: {
          viwGrid: { layout: DatabaseLayout.Timeline, cardSize: "large" },
        },
        fieldMeta: {
          fldStatus: {
            statusGroups: { Done: DatabaseStatusGroup.Complete },
          },
        },
      },
    });

    const res = await server.post("/api/databases.info", user, {
      body: { id: database.id },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.database.id).toEqual(database.id);
    expect(body.data.database.url).toEqual(`/db/${database.id}`);
    expect(body.data.database.externalTableId).toBeUndefined();
    const grid = body.data.views.find(
      (view: { id: string }) => view.id === "viwGrid"
    );
    expect(grid.layout).toEqual(DatabaseLayout.Timeline);
    expect(grid.overrides.cardSize).toEqual("large");
    const board = body.data.views.find(
      (view: { id: string }) => view.id === "viwBoard"
    );
    expect(board.layout).toEqual(DatabaseLayout.Board);
    const status = body.data.fields.find(
      (field: { id: string }) => field.id === "fldStatus"
    );
    expect(status.meta.statusGroups.Done).toEqual(DatabaseStatusGroup.Complete);
    expect(body.policies[0].abilities.read).toBe(true);

    const [call] = engine.callsTo("getSchema");
    expect(call.ref).toEqual({
      externalBaseId: database.externalBaseId,
      externalTableId: database.externalTableId,
    });
    expect(call.actor).toMatchObject({ outlineUserId: user.id });
  });

  it("counts the automations turned on for editors only", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    for (const enabled of [true, true, false]) {
      await DatabaseAutomation.create({
        teamId: database.teamId,
        databaseId: database.id,
        name: "Done",
        enabled,
        trigger: { type: "recordCreated" },
        actions: [],
        createdById: user.id,
      });
    }
    const viewer = await buildViewer({ teamId: user.teamId });

    const editorRes = await server.post("/api/databases.info", user, {
      body: { id: database.id },
    });
    const viewerRes = await server.post("/api/databases.info", viewer, {
      body: { id: database.id },
    });

    expect((await editorRes.json()).data.database.automationCount).toBe(2);
    expect(viewerRes.status).toEqual(200);
    expect(
      (await viewerRes.json()).data.database.automationCount
    ).toBeUndefined();
  });
});

describe("#databases.info links", () => {
  it("names the Outline database behind a link field", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    const target = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    engine.fields[2].options = { foreignTableId: target.externalTableId };

    const res = await server.post("/api/databases.info", user, {
      body: { id: database.id },
    });
    const body = await res.json();

    expect(body.data.fields[2].options.foreignDatabaseId).toEqual(target.id);
  });

  it("gives the engine ids to admins only", async () => {
    const admin = await buildAdmin();
    const collection = await buildCollection({
      teamId: admin.teamId,
      userId: admin.id,
    });
    const database = await buildDatabase({
      teamId: admin.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databases.info", admin, {
      body: { id: database.id },
    });
    const body = await res.json();

    expect(body.data.database.externalTableId).toEqual(
      database.externalTableId
    );
  });
});

describe("#databases.list", () => {
  it("lists the databases the user can read", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const privateCollection = await buildCollection({
      teamId: user.teamId,
      permission: null,
    });
    const visible = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Visible",
    });
    await buildDatabase({
      teamId: user.teamId,
      collectionId: privateCollection.id,
      title: "Hidden",
    });

    const res = await server.post("/api/databases.list", user, { body: {} });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.map((item: { id: string }) => item.id)).toEqual([
      visible.id,
    ]);
  });

  it("filters by title", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Kanban dev",
    });
    await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      title: "Roadmap",
    });

    const res = await server.post("/api/databases.list", user, {
      body: { collectionId: collection.id, query: "kanban" },
    });
    const body = await res.json();

    expect(body.data.map((item: { title: string }) => item.title)).toEqual([
      "Kanban dev",
    ]);
  });
});

describe("#databases.create", () => {
  it("creates a base named after the collection for its first database", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
      name: "Delisle",
    });

    const res = await server.post("/api/databases.create", user, {
      body: {
        collectionId: collection.id,
        title: "Kanban dev",
        layout: DatabaseLayout.Board,
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(engine.callsTo("createBase")[0].args).toEqual(["Delisle"]);
    const [createTable] = engine.callsTo("createTable");
    expect(createTable.actor).toMatchObject({ outlineUserId: user.id });
    expect(createTable.args[0]).toEqual("bseCreated");
    expect(createTable.args[1]).toMatchObject({
      name: "Kanban dev",
      view: { layout: DatabaseLayout.Board, stackFieldKey: "status" },
    });

    const database = await Database.findByPk(body.data.database.id);
    expect(database?.externalBaseId).toEqual("bseCreated");
    expect(database?.externalTableId).toEqual("tblCreated");
    expect(database?.documentId).toBeNull();
    expect(database?.createdById).toEqual(user.id);
    expect(database?.settings.fieldMeta?.fldNew1?.statusGroups).toEqual({
      "To do": DatabaseStatusGroup.ToDo,
      "In progress": DatabaseStatusGroup.InProgress,
      Done: DatabaseStatusGroup.Complete,
    });
    expect(body.data.views[0].layout).toEqual(DatabaseLayout.Board);
    expect(body.data.fields[1].meta.statusGroups).toBeDefined();
  });

  it("reuses the base of the nearest ancestor holding a database", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const parent = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });
    const child = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: parent.id,
    });
    await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      externalBaseId: "bseCollection",
      createdAt: new Date("2020-01-01"),
    });
    await buildDatabase({
      teamId: user.teamId,
      documentId: parent.id,
      externalBaseId: "bseParent",
    });

    const res = await server.post("/api/databases.create", user, {
      body: { collectionId: collection.id, documentId: child.id },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(engine.callsTo("createBase")).toHaveLength(0);
    expect(engine.callsTo("createTable")[0].args[0]).toEqual("bseParent");
    const database = await Database.findByPk(body.data.database.id);
    expect(database?.documentId).toEqual(child.id);
  });

  it("reuses the base of the collection", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      externalBaseId: "bseCollection",
    });

    const res = await server.post("/api/databases.create", user, {
      body: { collectionId: collection.id, layout: DatabaseLayout.List },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(engine.callsTo("createTable")[0].args[0]).toEqual("bseCollection");
    expect(body.data.views[0].layout).toEqual(DatabaseLayout.List);
    expect(body.data.views[0].type).toEqual("grid");
  });

  it("requires the right to edit the home document", async () => {
    const owner = await buildUser();
    const collection = await buildCollection({
      teamId: owner.teamId,
      userId: owner.id,
    });
    const document = await buildDocument({
      teamId: owner.teamId,
      userId: owner.id,
      collectionId: collection.id,
    });
    const viewer = await buildViewer({ teamId: owner.teamId });

    const res = await server.post("/api/databases.create", viewer, {
      body: { collectionId: collection.id, documentId: document.id },
    });

    expect(res.status).toEqual(403);
    expect(engine.calls).toHaveLength(0);
  });

  it("creates the database on the configured engine, in a base of that engine", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
      name: "Delisle",
    });
    await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      externalBaseId: "bseTeable",
    });
    const engineNames: string[] = [];
    setEngineFactory((database) => {
      engineNames.push(database.engine);
      return engine;
    });
    const previous = env.DATABASES_ENGINE;
    env.DATABASES_ENGINE = "outline";

    try {
      const res = await server.post("/api/databases.create", user, {
        body: { collectionId: collection.id },
      });
      const body = await res.json();

      expect(res.status).toEqual(200);
      expect(engineNames).toEqual(["outline"]);
      expect(engine.callsTo("createBase")[0].args).toEqual(["Delisle"]);
      const database = await Database.findByPk(body.data.database.id);
      expect(database?.engine).toEqual("outline");
      expect(database?.externalBaseId).toEqual("bseCreated");
    } finally {
      env.DATABASES_ENGINE = previous;
    }
  });
});

describe("#databases.update", () => {
  it("merges settings entry by entry", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: {
        viewOverrides: {
          viwGrid: { cardSize: "small" },
          viwBoard: { cardSize: "large" },
        },
        iconFieldId: "fldIcon",
      },
    });

    const res = await server.post("/api/databases.update", user, {
      body: {
        id: database.id,
        title: "Renamed",
        settings: {
          viewOverrides: {
            viwGrid: { openPagesIn: "fullPage", subItems: "flattened" },
            viwBoard: null,
          },
          pageLayout: {
            hideEmpty: true,
            fieldOrder: ["fldStatusAAAAAAAAAA", "fldIconAAAAAAAAAAAA"],
            pinnedFieldIds: ["fldStatusAAAAAAAAAA"],
          },
          fieldMeta: { fldStatusAAAAAAAAAA: { icon: "💵" } },
          subItemFieldId: "fldSubItems",
        },
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.title).toEqual("Renamed");
    expect(body.data.settings).toEqual({
      viewOverrides: {
        viwGrid: { openPagesIn: "fullPage", subItems: "flattened" },
      },
      iconFieldId: "fldIcon",
      pageLayout: {
        hideEmpty: true,
        fieldOrder: ["fldStatusAAAAAAAAAA", "fldIconAAAAAAAAAAAA"],
        pinnedFieldIds: ["fldStatusAAAAAAAAAA"],
      },
      fieldMeta: { fldStatusAAAAAAAAAA: { icon: "💵" } },
      subItemFieldId: "fldSubItems",
    });
  });

  it("keeps the tabs of row pages", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: { pageLayout: { hiddenFieldIds: ["fldNotes"] } },
    });
    const tabs = [
      { id: "8a7e1c2d-0000-4000-8000-000000000001", kind: "content" },
      {
        id: "8a7e1c2d-0000-4000-8000-000000000002",
        kind: "relation",
        name: "Suivi Kanban MGE",
        fieldId: "fldTasks",
        visibleFieldIds: ["fldStatus", "fldOwner"],
      },
    ];

    const res = await server.post("/api/databases.update", user, {
      body: { id: database.id, settings: { pageLayout: { tabs } } },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.settings.pageLayout).toEqual({
      hiddenFieldIds: ["fldNotes"],
      tabs,
    });

    const hidden = await server.post("/api/databases.update", user, {
      body: {
        id: database.id,
        settings: { pageLayout: { hiddenFieldIds: [], hideEmpty: true } },
      },
    });
    expect((await hidden.json()).data.settings.pageLayout.tabs).toEqual(tabs);
    const reloaded = await Database.findByPk(database.id);
    expect(reloaded?.settings.pageLayout?.tabs).toEqual(tabs);
  });

  it("refuses a relation tab without its field", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databases.update", user, {
      body: {
        id: database.id,
        settings: { pageLayout: { tabs: [{ id: "tab", kind: "relation" }] } },
      },
    });

    expect(res.status).toEqual(400);
  });

  it("forbids a viewer", async () => {
    const owner = await buildUser();
    const collection = await buildCollection({
      teamId: owner.teamId,
      userId: owner.id,
    });
    const database = await buildDatabase({
      teamId: owner.teamId,
      collectionId: collection.id,
    });
    const viewer = await buildViewer({ teamId: owner.teamId });

    const res = await server.post("/api/databases.update", viewer, {
      body: { id: database.id, title: "Nope" },
    });

    expect(res.status).toEqual(403);
  });
});

describe("#databases.delete", () => {
  it("soft deletes the database only in Outline", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databases.delete", user, {
      body: { id: database.id },
    });

    expect(res.status).toEqual(200);
    expect(await Database.findByPk(database.id)).toBeNull();
    expect(
      await Database.findByPk(database.id, { paranoid: false })
    ).not.toBeNull();
    expect(engine.calls).toHaveLength(0);
  });
});

describe("#databases.register", () => {
  it("requires an admin", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });

    const res = await server.post("/api/databases.register", user, {
      body: {
        collectionId: collection.id,
        externalBaseId: "bseMigrated",
        externalTableId: "tblMigrated",
      },
    });

    expect(res.status).toEqual(403);
  });

  it("registers a table once", async () => {
    const admin = await buildAdmin();
    const collection = await buildCollection({
      teamId: admin.teamId,
      userId: admin.id,
    });
    const document = await buildDocument({
      teamId: admin.teamId,
      userId: admin.id,
      collectionId: collection.id,
    });
    const body = {
      collectionId: collection.id,
      externalBaseId: "bseMigrated",
      externalTableId: "tblMigrated",
    };

    const first = await server.post("/api/databases.register", admin, {
      body,
    });
    const second = await server.post("/api/databases.register", admin, {
      body: { ...body, documentId: document.id, title: "Clients" },
    });
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toEqual(200);
    expect(firstBody.data.title).toEqual("Engine table");
    expect(secondBody.data.id).toEqual(firstBody.data.id);
    expect(secondBody.data.documentId).toEqual(document.id);
    expect(secondBody.data.title).toEqual("Clients");
    expect(engine.callsTo("describeTable")[0].actor).toEqual("system");
  });
});

describe("#databases.linkRows", () => {
  it("links existing documents to rows", async () => {
    const admin = await buildAdmin();
    const collection = await buildCollection({
      teamId: admin.teamId,
      userId: admin.id,
    });
    const database = await buildDatabase({
      teamId: admin.teamId,
      collectionId: collection.id,
    });
    const page = await buildDocument({
      teamId: admin.teamId,
      userId: admin.id,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databases.linkRows", admin, {
      body: {
        id: database.id,
        pairs: [{ recordId: "recOne", documentId: page.id }],
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.linked).toEqual(1);
    const linked = await Document.findByPk(page.id);
    expect(linked?.databaseId).toEqual(database.id);
    expect(linked?.databaseRecordId).toEqual("recOne");
  });
});

describe("#databases.convertEmbeds", () => {
  it("requires an admin", async () => {
    const user = await buildUser();
    const res = await server.post("/api/databases.convertEmbeds", user, {
      body: { dryRun: true },
    });
    expect(res.status).toEqual(403);
  });

  it("counts what a conversion would change", async () => {
    const admin = await buildAdmin();
    const collection = await buildCollection({
      teamId: admin.teamId,
      userId: admin.id,
    });

    const res = await server.post("/api/databases.convertEmbeds", admin, {
      body: { collectionId: collection.id, dryRun: true },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toMatchObject({ convertedEmbeds: 0, failed: 0 });
  });
});

describe("#databases.moveToOutlineEngine", () => {
  let store: InMemoryOutlineStore;

  beforeEach(() => {
    store = new InMemoryOutlineStore();
    setDatabaseEngineMoverFactory(
      (user) =>
        new DatabaseEngineMover({
          source: new FakeTeableBase(),
          store,
          files: new OutlineAttachmentFileStore(user),
          users: new OutlineUserDirectory(),
          mapper: new TeableMapper(),
        })
    );
  });

  afterEach(() => {
    setDatabaseEngineMoverFactory();
  });

  it("requires an admin", async () => {
    const user = await buildUser();
    const database = await buildDatabase({ teamId: user.teamId });
    const res = await server.post("/api/databases.moveToOutlineEngine", user, {
      body: { id: database.id, dryRun: true },
    });
    expect(res.status).toEqual(403);
  });

  it("returns 404 for a database of another team", async () => {
    const admin = await buildAdmin();
    const database = await buildDatabase();
    const res = await server.post("/api/databases.moveToOutlineEngine", admin, {
      body: { id: database.id, dryRun: true },
    });
    expect(res.status).toEqual(404);
  });

  it("counts what would move on a dry run", async () => {
    const admin = await buildAdmin();
    const database = await buildDatabase({
      teamId: admin.teamId,
      externalBaseId: "bseRoute",
      externalTableId: "tblOne",
    });

    const res = await server.post("/api/databases.moveToOutlineEngine", admin, {
      body: { id: database.id, dryRun: true },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toMatchObject({
      baseId: "bseRoute",
      dryRun: true,
      tables: [{ id: "tblOne", records: 2, databaseIds: [database.id] }],
      databaseIds: [database.id],
      notMoved: ["record history"],
    });
    expect(await store.base("bseRoute")).toEqual([]);
  });

  it("moves the base in a task", async () => {
    const admin = await buildAdmin();
    const database = await buildDatabase({
      teamId: admin.teamId,
      externalBaseId: "bseRoute",
      externalTableId: "tblOne",
    });
    const schedule = vi.mocked(BaseTask.prototype.schedule);

    const res = await server.post("/api/databases.moveToOutlineEngine", admin, {
      body: { id: database.id },
    });

    expect(res.status).toEqual(200);
    const index = schedule.mock.calls.findIndex(
      ([props]) => "databaseId" in props && props.databaseId === database.id
    );
    expect(schedule.mock.calls[index][0]).toEqual({
      databaseId: database.id,
      actorId: admin.id,
      dryRun: false,
    });
    const job: Job = await schedule.mock.results[index].value;
    await job.finished();

    const [table] = await store.base("bseRoute");
    expect(table.records.map((record) => record.orders)).toEqual([
      { viwGrid: 2 },
      { viwGrid: 1 },
    ]);
    await database.reload();
    expect(database.engine).toEqual("outline");
  });

  it("refuses a database that is not on Teable", async () => {
    const admin = await buildAdmin();
    const database = await buildDatabase({
      teamId: admin.teamId,
      engine: "outline",
    });
    const res = await server.post("/api/databases.moveToOutlineEngine", admin, {
      body: { id: database.id, dryRun: true },
    });
    expect(res.status).toEqual(400);
  });
});

import { DatabaseLayout } from "@shared/databases/types";
import { Database } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
  buildViewer,
} from "@server/test/factories";
import { Hook, PluginManager } from "@server/utils/PluginManager";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { FakeTablesDuplicator } from "../engine/__mocks__/FakeTablesDuplicator";
import { setTablesDuplicatorFactory } from "../engine/tablesDuplicator";
import databaseDuplicate from "./databaseDuplicate";

// Mounted here until the plugin registers the route: the API router reads the
// plugin hooks when it is first imported, by the test server below.
if (
  !PluginManager.getHooks(Hook.API).some(
    (hook) => hook.value === databaseDuplicate
  )
) {
  PluginManager.add({ type: Hook.API, value: databaseDuplicate });
}
const { getTestServer } = await import("@server/test/support");

const server = getTestServer();

let engine: FakeEngine;
let duplicator: FakeTablesDuplicator;

beforeEach(() => {
  engine = new FakeEngine();
  duplicator = new FakeTablesDuplicator();
  setEngineFactory(() => engine);
  setTablesDuplicatorFactory(() => duplicator);
});

afterEach(() => {
  setEngineFactory();
  setTablesDuplicatorFactory();
});

async function setup() {
  const user = await buildUser();
  const collection = await buildCollection({
    teamId: user.teamId,
    userId: user.id,
  });
  const page = await buildDocument({
    teamId: user.teamId,
    userId: user.id,
    collectionId: collection.id,
  });
  const database = await buildDatabase({
    teamId: user.teamId,
    documentId: page.id,
    title: "Suivi Kanban",
    icon: "📋",
    settings: {
      viewOverrides: { viwGrid: { layout: DatabaseLayout.List } },
      fieldMeta: { fldStatus: { endFieldId: "fldPerson" } },
      iconFieldId: "fldName",
    },
  });
  return { user, collection, page, database };
}

describe("#databases.duplicate", () => {
  it("requires authentication", async () => {
    const { database } = await setup();

    const res = await server.post("/api/databases.duplicate", {
      body: { id: database.id },
    });

    expect(res.status).toEqual(401);
  });

  it("copies a database onto another page, with its settings remapped", async () => {
    const { user, collection, database } = await setup();
    const target = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databases.duplicate", user, {
      body: { id: database.id, targetDocumentId: target.id },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(duplicator.calls).toHaveLength(1);
    expect(duplicator.calls[0].input).toEqual({
      externalBaseId: database.externalBaseId,
      tables: [
        { externalTableId: database.externalTableId, name: "Suivi Kanban" },
      ],
      withRecords: false,
    });
    expect(duplicator.calls[0].actor).toMatchObject({ outlineUserId: user.id });

    const copy = await Database.findByPk(body.data.database.id, {
      rejectOnEmpty: true,
    });
    expect(copy.id).not.toEqual(database.id);
    expect(copy.documentId).toEqual(target.id);
    expect(copy.collectionId).toEqual(collection.id);
    expect(copy.externalBaseId).toEqual(database.externalBaseId);
    expect(copy.externalTableId).toEqual(`${database.externalTableId}Copy1`);
    expect(copy.title).toEqual("Suivi Kanban");
    expect(copy.icon).toEqual("📋");
    expect(copy.createdById).toEqual(user.id);
    expect(copy.settings).toEqual({
      viewOverrides: { viwGridCopy1: { layout: DatabaseLayout.List } },
      fieldMeta: { fldStatusCopy1: { endFieldId: "fldPersonCopy1" } },
      iconFieldId: "fldNameCopy1",
    });
    expect(body.data.fields.length).toBeGreaterThan(0);
    expect(body.data.views.length).toBeGreaterThan(0);
    expect(body.policies[0].abilities.update).toBe(true);
    expect(engine.callsTo("getSchema")[0].ref).toEqual({
      externalBaseId: copy.externalBaseId,
      externalTableId: copy.externalTableId,
    });
  });

  it("copies next to the source, with its rows and a new title", async () => {
    const { user, page, database } = await setup();

    const res = await server.post("/api/databases.duplicate", user, {
      body: { id: database.id, withRecords: true, title: "Suivi (copie)" },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.database.documentId).toEqual(page.id);
    expect(body.data.database.title).toEqual("Suivi (copie)");
    expect(duplicator.calls[0].input).toMatchObject({
      tables: [{ name: "Suivi (copie)" }],
      withRecords: true,
    });
  });

  it("refuses a reader who cannot edit the page the copy would live on", async () => {
    const { user, collection, database } = await setup();
    const viewer = await buildViewer({ teamId: user.teamId });

    const beside = await server.post("/api/databases.duplicate", viewer, {
      body: { id: database.id },
    });
    const target = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });
    const onto = await server.post("/api/databases.duplicate", viewer, {
      body: { id: database.id, targetDocumentId: target.id },
    });

    expect(beside.status).toEqual(403);
    expect(onto.status).toEqual(403);
    expect(duplicator.calls).toHaveLength(0);
  });

  it("refuses a database the user cannot read", async () => {
    const { database } = await setup();
    const stranger = await buildUser();

    const res = await server.post("/api/databases.duplicate", stranger, {
      body: { id: database.id },
    });

    expect(res.status).toEqual(403);
    expect(duplicator.calls).toHaveLength(0);
  });
});

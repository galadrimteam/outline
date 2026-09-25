import { DatabaseLayout, DatabaseStatusGroup } from "@shared/databases/types";
import type { Collection, User } from "@server/models";
import { Database } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";

const server = getTestServer();

let engine: FakeEngine;
let user: User;
let collection: Collection;

beforeEach(async () => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
  user = await buildUser();
  collection = await buildCollection({ teamId: user.teamId, userId: user.id });
});

afterEach(() => {
  setEngineFactory();
});

describe("#databaseViews.create", () => {
  it("stores a timeline as an engine grid with an Outline layout", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databaseViews.create", user, {
      body: {
        databaseId: database.id,
        name: "Roadmap",
        layout: DatabaseLayout.Timeline,
        overrides: { timeline: { zoom: "month" } },
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(engine.callsTo("createView")[0].args[0]).toMatchObject({
      name: "Roadmap",
      type: "grid",
    });
    expect(body.data.layout).toEqual(DatabaseLayout.Timeline);
    expect(body.data.overrides.timeline).toEqual({ zoom: "month" });
    await database.reload();
    expect(database.settings.viewOverrides?.[body.data.id]).toEqual({
      layout: DatabaseLayout.Timeline,
      timeline: { zoom: "month" },
    });
  });

  it("stacks a new board by the first single select", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databaseViews.create", user, {
      body: {
        databaseId: database.id,
        name: "Kanban",
        layout: DatabaseLayout.Board,
      },
    });

    expect(res.status).toEqual(200);
    expect(engine.callsTo("createView")[0].args[0]).toMatchObject({
      type: "kanban",
      options: { stackFieldId: "fldStatus" },
    });
  });
});

describe("#databaseViews.update", () => {
  it("sends engine settings and merges Outline overrides", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: {
        viewOverrides: { viwBoard: { cardSize: "small", hiddenStacks: [""] } },
      },
    });
    const filter = {
      conjunction: "and",
      filterSet: [{ fieldId: "fldStatus", operator: "isNot", value: "Done" }],
    };

    const res = await server.post("/api/databaseViews.update", user, {
      body: {
        databaseId: database.id,
        viewId: "viwBoard",
        filter,
        overrides: { cardSize: "large", hiddenStacks: null },
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(engine.callsTo("updateView")[0].args).toEqual([
      "viwBoard",
      expect.objectContaining({ filter }),
    ]);
    expect(body.data.filter).toEqual(filter);
    expect(body.data.overrides).toEqual({ cardSize: "large" });
  });
});

describe("#databaseViews.update clearing ids", () => {
  it("turns an empty id into null for the engine and removes it from overrides", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: {
        viewOverrides: { viwGrid: { subGroupFieldId: "fldStatus" } },
      },
    });

    const res = await server.post("/api/databaseViews.update", user, {
      body: {
        databaseId: database.id,
        viewId: "viwGrid",
        options: { coverFieldId: "", frozenFieldId: null },
        overrides: { subGroupFieldId: "" },
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(engine.callsTo("updateView")[0].args[1]).toMatchObject({
      options: { coverFieldId: null, frozenFieldId: null },
    });
    expect(body.data.overrides).toEqual({});
  });
});

describe("#databaseViews.delete and duplicate", () => {
  it("copies and forgets overrides with the view", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: { viewOverrides: { viwGrid: { layout: DatabaseLayout.List } } },
    });

    const duplicate = await server.post("/api/databaseViews.duplicate", user, {
      body: { databaseId: database.id, viewId: "viwGrid" },
    });
    const duplicateBody = await duplicate.json();
    expect(duplicateBody.data.id).toEqual("viwGridCopy");
    expect(duplicateBody.data.layout).toEqual(DatabaseLayout.List);

    const res = await server.post("/api/databaseViews.delete", user, {
      body: { databaseId: database.id, viewId: "viwGrid" },
    });
    expect(res.status).toEqual(200);

    const reloaded = await Database.findByPk(database.id);
    expect(reloaded?.settings.viewOverrides).toEqual({
      viwGridCopy: { layout: DatabaseLayout.List },
    });
  });
});

describe("#databaseViews.reorder", () => {
  it("returns every view", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databaseViews.reorder", user, {
      body: {
        databaseId: database.id,
        viewId: "viwBoard",
        anchorId: "viwGrid",
        position: "before",
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toHaveLength(2);
  });
});

describe("#databaseFields", () => {
  it("creates, renames, converts and deletes a field", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: {
        fieldMeta: {
          fldStatus: { statusGroups: { Done: DatabaseStatusGroup.Complete } },
        },
        iconFieldId: "fldStatus",
        pageLayout: { hiddenFieldIds: ["fldStatus", "fldName"] },
      },
    });

    const created = await server.post("/api/databaseFields.create", user, {
      body: {
        databaseId: database.id,
        name: "Priority",
        type: "singleSelect",
        options: { choices: [{ name: "P1", color: "redBright" }] },
        viewId: "viwGrid",
      },
    });
    expect(created.status).toEqual(200);
    expect(engine.callsTo("createField")[0].args[0]).toEqual({
      name: "Priority",
      type: "singleSelect",
      options: { choices: [{ name: "P1", color: "redBright" }] },
      viewId: "viwGrid",
    });

    const renamed = await server.post("/api/databaseFields.update", user, {
      body: { databaseId: database.id, fieldId: "fldStatus", name: "State" },
    });
    const renamedBody = await renamed.json();
    expect(renamedBody.data.name).toEqual("State");
    expect(renamedBody.data.meta.statusGroups.Done).toEqual(
      DatabaseStatusGroup.Complete
    );

    const converted = await server.post("/api/databaseFields.convert", user, {
      body: { databaseId: database.id, fieldId: "fldName", type: "longText" },
    });
    expect((await converted.json()).data.type).toEqual("longText");

    const deleted = await server.post("/api/databaseFields.delete", user, {
      body: { databaseId: database.id, fieldId: "fldStatus" },
    });
    expect(deleted.status).toEqual(200);
    const reloaded = await Database.findByPk(database.id);
    expect(reloaded?.settings).toEqual({
      fieldMeta: {},
      pageLayout: { hiddenFieldIds: ["fldName"] },
    });
  });

  it("duplicates a field with its metadata", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      settings: {
        fieldMeta: {
          fldStatus: { statusGroups: { Done: DatabaseStatusGroup.Complete } },
        },
      },
    });

    const res = await server.post("/api/databaseFields.duplicate", user, {
      body: { databaseId: database.id, fieldId: "fldStatus" },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.id).toEqual("fldStatusCopy");
    expect(body.data.meta.statusGroups.Done).toEqual(
      DatabaseStatusGroup.Complete
    );
  });

  it("links to another database by its Outline id, never an engine table id", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    const target = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databaseFields.create", user, {
      body: {
        databaseId: database.id,
        name: "Client",
        type: "link",
        options: {
          foreignDatabaseId: target.id,
          foreignTableId: "tblSomeoneElse",
          relationship: "manyOne",
        },
      },
    });

    expect(res.status).toEqual(200);
    expect(engine.callsTo("createField")[0].args[0]).toMatchObject({
      options: {
        foreignTableId: target.externalTableId,
        baseId: target.externalBaseId,
        relationship: "manyOne",
      },
    });
  });

  it("refuses a link to a database of another team", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    const foreign = await buildDatabase();

    const res = await server.post("/api/databaseFields.create", user, {
      body: {
        databaseId: database.id,
        name: "Client",
        type: "link",
        options: { foreignDatabaseId: foreign.id },
      },
    });

    expect(res.status).toEqual(403);
    expect(engine.callsTo("createField")).toHaveLength(0);
  });

  it("rejects an unknown field type", async () => {
    const database = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });

    const res = await server.post("/api/databaseFields.create", user, {
      body: { databaseId: database.id, name: "X", type: "hologram" },
    });

    expect(res.status).toEqual(400);
  });
});

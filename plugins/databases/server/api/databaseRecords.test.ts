import FormData from "form-data";
import { Document } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
  buildViewer,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import type { Collection, Database, User } from "@server/models";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";

const server = getTestServer();

let engine: FakeEngine;
let user: User;
let collection: Collection;
let database: Database;

beforeEach(async () => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
  user = await buildUser();
  collection = await buildCollection({ teamId: user.teamId, userId: user.id });
  database = await buildDatabase({
    teamId: user.teamId,
    collectionId: collection.id,
    settings: { iconFieldId: "fldIcon" },
  });
});

afterEach(() => {
  setEngineFactory();
});

describe("#databaseRecords.list", () => {
  it("reads the table of the database, whatever the client sends", async () => {
    engine.addRecord("rec1", { fldName: "First" });
    engine.addRecord("rec2", { fldName: "Second" });

    const res = await server.post("/api/databaseRecords.list", user, {
      body: {
        databaseId: database.id,
        viewId: "viwBoard",
        externalTableId: "tblSomeoneElse",
        tableId: "tblSomeoneElse",
        search: "Fir",
        limit: 1,
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ offset: 0, limit: 1, total: 2 });
    const [call] = engine.callsTo("listRecords");
    expect(call.ref).toEqual({
      externalBaseId: database.externalBaseId,
      externalTableId: database.externalTableId,
    });
    expect(call.args[0]).toMatchObject({
      viewId: "viwBoard",
      search: "Fir",
      skip: 0,
      take: 1,
    });
  });

  it("marks rows that have a page and people that are Outline users", async () => {
    const page = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });
    await Document.update(
      { databaseId: database.id, databaseRecordId: "rec1" },
      { where: { id: page.id } }
    );
    engine.addRecord("rec1", {
      fldPerson: { id: "usr1", title: user.name, email: user.email ?? "" },
    });
    engine.addRecord("rec2", {
      fldPerson: [{ id: "usr2", title: "Stranger", email: "x@example.com" }],
    });

    const res = await server.post("/api/databaseRecords.list", user, {
      body: { databaseId: database.id, viewId: "viwGrid" },
    });
    const body = await res.json();

    expect(body.data[0].documentId).toEqual(page.id);
    expect(body.data[0].fields.fldPerson.outlineUserId).toEqual(user.id);
    expect(body.data[1].documentId).toBeNull();
    expect(body.data[1].fields.fldPerson[0].outlineUserId).toBeNull();
  });

  it("lets an editor replace the view's filter", async () => {
    const filter = { conjunction: "and", filterSet: [] };

    await server.post("/api/databaseRecords.list", user, {
      body: {
        databaseId: database.id,
        viewId: "viwGrid",
        filter,
        replaceFilter: true,
      },
    });

    expect(engine.callsTo("listRecords")[0].args[0]).toMatchObject({
      filter,
      replaceFilter: true,
    });
  });

  it("rejects an engine id that is not an identifier", async () => {
    const res = await server.post("/api/databaseRecords.list", user, {
      body: { databaseId: database.id, viewId: "../../base/bse1" },
    });
    expect(res.status).toEqual(400);
    expect(engine.calls).toHaveLength(0);
  });

  it("returns 403 to a member of another team", async () => {
    const stranger = await buildUser();
    const res = await server.post("/api/databaseRecords.list", stranger, {
      body: { databaseId: database.id, viewId: "viwGrid" },
    });
    expect(res.status).toEqual(403);
    expect(engine.calls).toHaveLength(0);
  });
});

describe("#databaseRecords.create", () => {
  it("writes people as engine users", async () => {
    const colleague = await buildUser({ teamId: user.teamId });

    const res = await server.post("/api/databaseRecords.create", user, {
      body: {
        databaseId: database.id,
        fields: {
          fldName: "Card",
          fldPerson: [{ outlineUserId: colleague.id }],
        },
        order: { viewId: "viwBoard", anchorId: "rec9", position: "after" },
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    const [ensure] = engine.callsTo("ensureUsers");
    expect(ensure.args[0]).toEqual([
      { email: colleague.email, name: colleague.name },
    ]);
    const [create] = engine.callsTo("createRecord");
    expect(create.actor).toMatchObject({ outlineUserId: user.id });
    expect(create.args[0]).toMatchObject({
      fields: {
        fldName: "Card",
        fldPerson: [{ id: "usr1", title: colleague.name }],
      },
      order: { viewId: "viwBoard", anchorId: "rec9", position: "after" },
    });
    expect(body.data.fields.fldPerson[0].outlineUserId).toEqual(colleague.id);
  });

  it("refuses a person of another team", async () => {
    const stranger = await buildUser();

    const res = await server.post("/api/databaseRecords.create", user, {
      body: {
        databaseId: database.id,
        fields: { fldPerson: { outlineUserId: stranger.id } },
      },
    });

    expect(res.status).toEqual(400);
    expect(engine.callsTo("createRecord")).toHaveLength(0);
  });

  it("forbids a viewer", async () => {
    const viewer = await buildViewer({ teamId: user.teamId });

    const res = await server.post("/api/databaseRecords.create", viewer, {
      body: { databaseId: database.id, fields: { fldName: "Nope" } },
    });

    expect(res.status).toEqual(403);
  });
});

describe("#databaseRecords.move", () => {
  it("writes the cells then orders the records in the view", async () => {
    engine.addRecord("rec1", { fldStatus: "To do" });

    const res = await server.post("/api/databaseRecords.move", user, {
      body: {
        databaseId: database.id,
        viewId: "viwBoard",
        recordIds: ["rec1"],
        anchorId: "rec2",
        position: "before",
        fields: { fldStatus: "Done" },
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data[0].fields.fldStatus).toEqual("Done");
    expect(engine.callsTo("moveRecords")[0].args[0]).toEqual({
      viewId: "viwBoard",
      recordIds: ["rec1"],
      anchorId: "rec2",
      position: "before",
      fields: { fldStatus: "Done" },
    });
  });
});

describe("#databaseRecords.delete", () => {
  it("deletes records", async () => {
    engine.addRecord("rec1", {});

    const res = await server.post("/api/databaseRecords.delete", user, {
      body: { databaseId: database.id, recordIds: ["rec1"] },
    });

    expect(res.status).toEqual(200);
    expect(engine.records.has("rec1")).toBe(false);
  });
});

describe("#databaseRecords.open", () => {
  it("creates the row's page on first open, then reuses it", async () => {
    engine.addRecord("rec1", { fldName: "My card", fldIcon: "🚀" });

    const first = await server.post("/api/databaseRecords.open", user, {
      body: { databaseId: database.id, recordId: "rec1" },
    });
    const firstBody = await first.json();
    const second = await server.post("/api/databaseRecords.open", user, {
      body: { databaseId: database.id, recordId: "rec1" },
    });
    const secondBody = await second.json();

    expect(first.status).toEqual(200);
    expect(firstBody.data.title).toEqual("My card");
    expect(firstBody.data.icon).toEqual("🚀");
    expect(firstBody.data.databaseId).toEqual(database.id);
    expect(firstBody.data.databaseRecordId).toEqual("rec1");
    expect(firstBody.policies[0].abilities.read).toBe(true);
    expect(secondBody.data.id).toEqual(firstBody.data.id);
    expect(engine.callsTo("getRecord")).toHaveLength(1);
  });
});

describe("#databaseRecords reads", () => {
  it("returns group points, statistics, candidates and history", async () => {
    engine.addRecord("rec1", {});

    const groups = await server.post("/api/databaseRecords.groups", user, {
      body: { databaseId: database.id, viewId: "viwBoard" },
    });
    const aggregate = await server.post(
      "/api/databaseRecords.aggregate",
      user,
      {
        body: {
          databaseId: database.id,
          viewId: "viwGrid",
          fieldStats: { fldName: "filled" },
        },
      }
    );
    const candidates = await server.post(
      "/api/databaseRecords.linkCandidates",
      user,
      { body: { databaseId: database.id, fieldId: "fldLink" } }
    );
    const history = await server.post("/api/databaseRecords.history", user, {
      body: { databaseId: database.id, recordId: "rec1" },
    });

    expect((await groups.json()).data[1]).toEqual({ type: "row", count: 1 });
    expect((await aggregate.json()).data).toEqual({ fldName: { value: 1 } });
    expect((await candidates.json()).data).toEqual([
      { id: "recLinked", title: "Linked" },
    ]);
    const historyBody = await history.json();
    expect(historyBody.data).toEqual([]);
    expect(historyBody.pagination).toEqual({ nextCursor: null });
  });
});

describe("#databaseRecords.upload", () => {
  it("uploads a file into an attachment cell", async () => {
    engine.addRecord("rec1", {});
    const form = new FormData();
    form.append("databaseId", database.id);
    form.append("recordId", "rec1");
    form.append("fieldId", "fldFiles");
    form.append("file", Buffer.from("hello"), {
      filename: "hello.txt",
      contentType: "text/plain",
    });

    const res = await server.post("/api/databaseRecords.upload", user, {
      headers: form.getHeaders(),
      body: form,
    });

    expect(res.status).toEqual(200);
    expect(engine.callsTo("uploadAttachment")[0].args[0]).toMatchObject({
      recordId: "rec1",
      fieldId: "fldFiles",
      fileName: "hello.txt",
      mimeType: "text/plain",
    });
  });
});

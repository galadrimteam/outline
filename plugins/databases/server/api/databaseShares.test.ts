import { Document } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildShare,
  buildTeam,
  buildUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";

const server = getTestServer();

let engine: FakeEngine;

beforeEach(() => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
});

afterEach(() => {
  setEngineFactory();
});

/** A page of a private collection, holding a database, shared publicly. */
async function setup() {
  const team = await buildTeam();
  const owner = await buildUser({ teamId: team.id });
  const collection = await buildCollection({
    teamId: team.id,
    userId: owner.id,
    permission: null,
  });
  const page = await buildDocument({
    teamId: team.id,
    userId: owner.id,
    collectionId: collection.id,
  });
  const database = await buildDatabase({
    teamId: team.id,
    documentId: page.id,
    createdById: owner.id,
  });
  const share = await buildShare({
    teamId: team.id,
    userId: owner.id,
    documentId: page.id,
    includeChildDocuments: true,
  });
  engine.addRecord("rec1", {
    fldName: "Carte",
    fldPerson: { id: "usr1", title: "Ada", email: "ada@example.com" },
  });
  return { team, owner, collection, page, database, share };
}

describe("databases read through a public share", () => {
  it("are readable by anyone holding the share", async () => {
    const { database, share } = await setup();

    const info = await server.post("/api/databases.info", {
      body: { id: database.id, shareId: share.id },
    });
    const list = await server.post("/api/databaseRecords.list", {
      body: {
        databaseId: database.id,
        viewId: "viwGrid",
        shareId: share.id,
        replaceFilter: true,
        filter: { conjunction: "and", filterSet: [] },
      },
    });
    const record = await server.post("/api/databaseRecords.info", {
      body: { databaseId: database.id, recordId: "rec1", shareId: share.id },
    });
    const groups = await server.post("/api/databaseRecords.groups", {
      body: { databaseId: database.id, viewId: "viwBoard", shareId: share.id },
    });
    const aggregate = await server.post("/api/databaseRecords.aggregate", {
      body: {
        databaseId: database.id,
        viewId: "viwGrid",
        fieldStats: { fldName: "count" },
        shareId: share.id,
      },
    });

    expect(info.status).toEqual(200);
    const infoBody = await info.json();
    expect(infoBody.data.database.id).toEqual(database.id);
    expect(infoBody.data.database.externalTableId).toBeUndefined();
    expect(infoBody.policies).toBeUndefined();
    expect(list.status).toEqual(200);
    const listBody = await list.json();
    expect(listBody.data[0].fields.fldPerson).toEqual({
      id: "usr1",
      title: "Ada",
      outlineUserId: null,
    });
    expect(record.status).toEqual(200);
    expect((await record.json()).data.fields.fldPerson.email).toBeUndefined();
    expect(groups.status).toEqual(200);
    expect(aggregate.status).toEqual(200);

    for (const call of engine.calls) {
      expect(call.actor).toEqual("system");
    }
    const [listCall] = engine.callsTo("listRecords");
    expect(listCall.args[0]).toMatchObject({ replaceFilter: false });
  });

  it("opens a row's page, created as the database's creator, readable through the share", async () => {
    const { owner, database, share } = await setup();

    const res = await server.post("/api/databaseRecords.open", {
      body: { databaseId: database.id, recordId: "rec1", shareId: share.id },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.policies).toBeUndefined();
    const row = await Document.findByPk(body.data.id, { rejectOnEmpty: true });
    expect(row.createdById).toEqual(owner.id);
    expect(row.databaseRecordId).toEqual("rec1");

    const page = await server.post("/api/documents.info", {
      body: { id: row.id, shareId: share.id },
    });
    expect(page.status).toEqual(200);
  });

  it("asks for an account without a share", async () => {
    const { database } = await setup();

    const res = await server.post("/api/databaseRecords.list", {
      body: { databaseId: database.id, viewId: "viwGrid" },
    });

    expect(res.status).toEqual(401);
  });

  it("refuses the share of another page", async () => {
    const { team, owner, collection, database } = await setup();
    const other = await buildDocument({
      teamId: team.id,
      userId: owner.id,
      collectionId: collection.id,
    });
    const otherShare = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: other.id,
      includeChildDocuments: true,
    });

    const res = await server.post("/api/databases.info", {
      body: { id: database.id, shareId: otherShare.id },
    });

    expect(res.status).toEqual(403);
    expect(engine.calls).toHaveLength(0);
  });

  it("never lets a share write", async () => {
    const { team, database, share } = await setup();
    const member = await buildUser({ teamId: team.id });
    const body = {
      databaseId: database.id,
      recordId: "rec1",
      fields: { fldName: "Piratée" },
      shareId: share.id,
    };

    const anonymous = await server.post("/api/databaseRecords.update", {
      body,
    });
    const signedIn = await server.post("/api/databaseRecords.update", member, {
      body,
    });
    const view = await server.post("/api/databaseViews.update", {
      body: {
        databaseId: database.id,
        viewId: "viwGrid",
        name: "Piratée",
        shareId: share.id,
      },
    });
    const readable = await server.post("/api/databaseRecords.list", member, {
      body: { databaseId: database.id, viewId: "viwGrid", shareId: share.id },
    });

    expect(anonymous.status).toEqual(401);
    expect(signedIn.status).toEqual(403);
    expect(view.status).toEqual(401);
    expect(readable.status).toEqual(200);
    expect(engine.callsTo("updateRecord")).toHaveLength(0);
    expect(engine.callsTo("updateView")).toHaveLength(0);
  });
});

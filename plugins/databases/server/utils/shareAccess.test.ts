import type { DatabaseRecord } from "@shared/databases/types";
import { CollectionPermission, DocumentPermission } from "@shared/types";
import { Collection, Database, UserMembership } from "@server/models";
import type { User } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildGuestUser,
  buildShare,
  buildTeam,
  buildUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import type { APIContext } from "@server/types";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import {
  authorizeDatabaseRead,
  loadDatabaseForRead,
  redactGroupPointsForShare,
  redactRecordsForShare,
  rowPageAuthorFor,
} from "./shareAccess";

const server = getTestServer();

let engine: FakeEngine;

beforeEach(() => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
});

afterEach(() => {
  setEngineFactory();
});

/** A request context, signed in or anonymous, as the routes receive it. */
function requestFor(user?: User): APIContext {
  return {
    state: { auth: user ? { user, token: "test" } : {} },
  } as APIContext;
}

/** A private collection with a page holding a database, as a project page. */
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
  return { team, owner, collection, page, database };
}

describe("authorizeDatabaseRead", () => {
  it("lets a user who can read the anchor read as themselves", async () => {
    const { owner, database } = await setup();

    const access = await loadDatabaseForRead(requestFor(owner), database.id);

    expect(access.shareId).toBeNull();
    expect(access.actor).toMatchObject({ outlineUserId: owner.id });
  });

  it("asks an anonymous request without a share to sign in", async () => {
    const { database } = await setup();

    await expect(
      loadDatabaseForRead(requestFor(), database.id)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("refuses a member without rights and without a share", async () => {
    const { team, database } = await setup();
    const member = await buildUser({ teamId: team.id });

    await expect(
      loadDatabaseForRead(requestFor(member), database.id)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets anyone read a database anchored on a shared page", async () => {
    const { team, owner, page, database } = await setup();
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
      includeChildDocuments: true,
    });

    const access = await loadDatabaseForRead(
      requestFor(),
      database.id,
      share.id
    );

    expect(access.shareId).toEqual(share.id);
    expect(access.user).toBeNull();
    expect(access.actor).toEqual("system");
  });

  it("finds a share by its url slug", async () => {
    const { team, owner, page, database } = await setup();
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
      urlId: "projet-client",
    });
    const reader = await buildUser({ teamId: team.id });

    const access = await loadDatabaseForRead(
      requestFor(reader),
      database.id,
      "projet-client"
    );

    expect(access.shareId).toEqual(share.id);
    expect(access.actor).toEqual("system");
  });

  it("lets a share of a parent page with its children read a database below", async () => {
    const { team, owner, collection, page } = await setup();
    const child = await buildDocument({
      teamId: team.id,
      userId: owner.id,
      collectionId: collection.id,
      parentDocumentId: page.id,
    });
    const structured = await Collection.findByPk(collection.id, {
      includeDocumentStructure: true,
      rejectOnEmpty: true,
    });
    await structured.addDocumentToStructure(page, 0);
    await structured.addDocumentToStructure(child, 0);
    const database = await buildDatabase({
      teamId: team.id,
      documentId: child.id,
    });
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
      includeChildDocuments: true,
    });

    const access = await loadDatabaseForRead(
      requestFor(),
      database.id,
      share.id
    );

    expect(access.shareId).toEqual(share.id);
  });

  it("refuses a share of another page", async () => {
    const { team, owner, collection, database } = await setup();
    const other = await buildDocument({
      teamId: team.id,
      userId: owner.id,
      collectionId: collection.id,
    });
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: other.id,
      includeChildDocuments: true,
    });

    await expect(
      loadDatabaseForRead(requestFor(), database.id, share.id)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a page share for a database anchored on the collection", async () => {
    const { team, owner, collection, page } = await setup();
    const database = await buildDatabase({
      teamId: team.id,
      collectionId: collection.id,
    });
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
      includeChildDocuments: true,
    });

    await expect(
      loadDatabaseForRead(requestFor(), database.id, share.id)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets a collection share read a database anchored on the collection", async () => {
    const { team, owner, collection } = await setup();
    const database = await buildDatabase({
      teamId: team.id,
      collectionId: collection.id,
    });
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      collectionId: collection.id,
      includeChildDocuments: true,
    });

    const access = await loadDatabaseForRead(
      requestFor(),
      database.id,
      share.id
    );

    expect(access.shareId).toEqual(share.id);
  });

  it("refuses a revoked or unpublished share", async () => {
    const { team, owner, page, database } = await setup();
    const revoked = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
      revokedAt: new Date(),
      revokedById: owner.id,
    });
    const draft = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
      published: false,
    });

    await expect(
      loadDatabaseForRead(requestFor(), database.id, revoked.id)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      loadDatabaseForRead(requestFor(), database.id, draft.id)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a share when the team turned public sharing off", async () => {
    const { team, owner, page, database } = await setup();
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
    });
    team.sharing = false;
    await team.save();

    await expect(
      loadDatabaseForRead(requestFor(), database.id, share.id)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the user's own rights first when a share is given too", async () => {
    const { team, owner, page, database } = await setup();
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
    });

    const loaded = await Database.findByPkForUser(database.id, owner.id);
    if (!loaded) {
      throw new Error("The database should exist");
    }

    const access = await authorizeDatabaseRead(
      requestFor(owner),
      loaded,
      share.id
    );

    expect(access.shareId).toBeNull();
    expect(access.actor).toMatchObject({ outlineUserId: owner.id });
  });
});

describe("rowPageAuthorFor", () => {
  it("creates row pages opened through a share as the database's creator", async () => {
    const { team, owner, page, database } = await setup();
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
    });
    const access = await loadDatabaseForRead(
      requestFor(),
      database.id,
      share.id
    );

    const author = await rowPageAuthorFor(access);

    expect(author.id).toEqual(owner.id);
  });

  it("creates them as the reader when their own rights allow the read", async () => {
    const { owner, database } = await setup();
    const access = await loadDatabaseForRead(requestFor(owner), database.id);

    const author = await rowPageAuthorFor(access);

    expect(author.id).toEqual(owner.id);
  });
});

describe("redaction for share readers", () => {
  const person = {
    id: "usr1",
    title: "Ada",
    email: "ada@example.com",
    outlineUserId: null,
  };
  const records: DatabaseRecord[] = [
    {
      id: "rec1",
      fields: {
        fldName: "Carte",
        fldPerson: person,
        fldPeople: [person],
        fldLink: [{ id: "rec2", title: "Autre" }],
      },
    },
  ];

  it("removes the email of people from what a share reader gets", async () => {
    const { team, owner, page, database } = await setup();
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
    });
    const access = await loadDatabaseForRead(
      requestFor(),
      database.id,
      share.id
    );

    const [record] = redactRecordsForShare(access, records);
    const [header] = redactGroupPointsForShare(access, [
      {
        type: "header",
        id: "grp1",
        depth: 0,
        value: person,
        isCollapsed: false,
      },
    ]);

    expect(record.fields.fldName).toEqual("Carte");
    expect(record.fields.fldPerson).toEqual({
      id: "usr1",
      title: "Ada",
      outlineUserId: null,
    });
    expect(record.fields.fldPeople).toEqual([
      { id: "usr1", title: "Ada", outlineUserId: null },
    ]);
    expect(record.fields.fldLink).toEqual([{ id: "rec2", title: "Autre" }]);
    expect(header).toMatchObject({ value: { id: "usr1", title: "Ada" } });
    expect(header.type === "header" && header.value).not.toHaveProperty(
      "email"
    );
  });

  it("keeps records as they are for a reader with their own rights", async () => {
    const { owner, database } = await setup();
    const access = await loadDatabaseForRead(requestFor(owner), database.id);

    expect(redactRecordsForShare(access, records)).toBe(records);
  });
});

describe("guests", () => {
  it("read and edit a database through their membership of its page", async () => {
    const { team, owner, page, database } = await setup();
    engine.addRecord("rec1", { fldName: "Carte" });
    const reader = await buildGuestUser({ teamId: team.id });
    const editor = await buildGuestUser({ teamId: team.id });
    await UserMembership.create({
      documentId: page.id,
      userId: reader.id,
      createdById: owner.id,
      permission: DocumentPermission.Read,
    });
    await UserMembership.create({
      documentId: page.id,
      userId: editor.id,
      createdById: owner.id,
      permission: DocumentPermission.ReadWrite,
    });

    const info = await server.post("/api/databases.info", reader, {
      body: { id: database.id },
    });
    const list = await server.post("/api/databaseRecords.list", reader, {
      body: { databaseId: database.id, viewId: "viwGrid" },
    });
    const refused = await server.post("/api/databaseRecords.update", reader, {
      body: {
        databaseId: database.id,
        recordId: "rec1",
        fields: { fldName: "Lu" },
      },
    });
    const updated = await server.post("/api/databaseRecords.update", editor, {
      body: {
        databaseId: database.id,
        recordId: "rec1",
        fields: { fldName: "Validée" },
      },
    });

    expect(info.status).toEqual(200);
    expect((await info.json()).policies[0].abilities.update).toBe(false);
    expect(list.status).toEqual(200);
    expect(refused.status).toEqual(403);
    expect(updated.status).toEqual(200);
    expect(engine.records.get("rec1")?.fields.fldName).toEqual("Validée");
  });

  it("do not reach a database anchored on a page they are not a member of", async () => {
    const { team, owner, collection, database } = await setup();
    const clientPage = await buildDocument({
      teamId: team.id,
      userId: owner.id,
      collectionId: collection.id,
    });
    const guest = await buildGuestUser({ teamId: team.id });
    await UserMembership.create({
      documentId: clientPage.id,
      userId: guest.id,
      createdById: owner.id,
      permission: DocumentPermission.ReadWrite,
    });

    const res = await server.post("/api/databases.info", guest, {
      body: { id: database.id },
    });

    expect(res.status).toEqual(403);
    expect(engine.calls).toHaveLength(0);
  });

  it("read a database anchored on a collection they are a member of", async () => {
    const { team, owner, collection } = await setup();
    const database = await buildDatabase({
      teamId: team.id,
      collectionId: collection.id,
    });
    const guest = await buildGuestUser({ teamId: team.id });
    await UserMembership.create({
      collectionId: collection.id,
      userId: guest.id,
      createdById: owner.id,
      permission: CollectionPermission.Read,
    });

    const res = await server.post("/api/databases.info", guest, {
      body: { id: database.id },
    });

    expect(res.status).toEqual(200);
  });
});

describe("writes through a share", () => {
  it("are refused to anonymous readers and to members without rights", async () => {
    const { team, owner, page, database } = await setup();
    engine.addRecord("rec1", { fldName: "Carte" });
    const share = await buildShare({
      teamId: team.id,
      userId: owner.id,
      documentId: page.id,
    });
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

    expect(anonymous.status).toEqual(401);
    expect(signedIn.status).toEqual(403);
    expect(engine.callsTo("updateRecord")).toHaveLength(0);
  });
});

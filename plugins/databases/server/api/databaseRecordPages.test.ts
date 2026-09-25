import { CollectionPermission } from "@shared/types";
import { Document } from "@server/models";
import type { Collection, Database, User } from "@server/models";
import {
  buildCollection,
  buildComment,
  buildDatabase,
  buildDocument,
  buildResolvedComment,
  buildTemplate,
  buildUser,
} from "@server/test/factories";
import { Hook, PluginManager } from "@server/utils/PluginManager";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import databaseRecordPages from "./databaseRecordPages";

// The API mounts plugin routers when it is first imported, so this router must
// be registered before the test server is built, until the plugin registers it.
if (
  !PluginManager.getHooks(Hook.API).some(
    (hook) => hook.value === databaseRecordPages
  )
) {
  PluginManager.add({ type: Hook.API, value: databaseRecordPages });
}
const { getTestServer } = await import("@server/test/support");

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
  });
});

afterEach(() => {
  setEngineFactory();
});

async function buildRowPage(recordId: string) {
  const page = await buildDocument({
    teamId: user.teamId,
    userId: user.id,
    collectionId: collection.id,
  });
  await Document.update(
    { databaseId: database.id, databaseRecordId: recordId },
    { where: { id: page.id } }
  );
  return page;
}

describe("#databaseRecords.commentCounts", () => {
  it("counts the open comments and replies of each row page", async () => {
    const page = await buildRowPage("rec1");
    const thread = await buildComment({ userId: user.id, documentId: page.id });
    await buildComment({
      userId: user.id,
      documentId: page.id,
      parentCommentId: thread.id,
    });
    await buildResolvedComment(user, { userId: user.id, documentId: page.id });
    await buildRowPage("rec2");

    const res = await server.post("/api/databaseRecords.commentCounts", user, {
      body: { databaseId: database.id, recordIds: ["rec1", "rec2", "rec3"] },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toEqual({ rec1: 2, rec2: 0, rec3: 0 });
  });

  it("ignores the pages of another database", async () => {
    const other = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    const page = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });
    await Document.update(
      { databaseId: other.id, databaseRecordId: "rec1" },
      { where: { id: page.id } }
    );
    await buildComment({ userId: user.id, documentId: page.id });

    const res = await server.post("/api/databaseRecords.commentCounts", user, {
      body: { databaseId: database.id, recordIds: ["rec1"] },
    });
    const body = await res.json();

    expect(body.data).toEqual({ rec1: 0 });
  });

  it("returns 403 to a member of another team", async () => {
    const stranger = await buildUser();

    const res = await server.post(
      "/api/databaseRecords.commentCounts",
      stranger,
      { body: { databaseId: database.id, recordIds: ["rec1"] } }
    );

    expect(res.status).toEqual(403);
  });

  it("rejects too many rows", async () => {
    const res = await server.post("/api/databaseRecords.commentCounts", user, {
      body: {
        databaseId: database.id,
        recordIds: Array.from({ length: 201 }, (_, index) => `rec${index}`),
      },
    });

    expect(res.status).toEqual(400);
  });
});

describe("#databaseRecords.createFromTemplate", () => {
  it("creates the row and its page from the template", async () => {
    const template = await buildTemplate({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
      title: "Réunion",
      text: "Ordre du jour",
      icon: "📋",
    });

    const res = await server.post(
      "/api/databaseRecords.createFromTemplate",
      user,
      {
        body: {
          databaseId: database.id,
          templateId: template.id,
          fields: { fldStatus: "À faire" },
          order: { viewId: "viwBoard", anchorId: "rec9", position: "after" },
        },
      }
    );
    const body = await res.json();

    expect(res.status).toEqual(200);
    const [create] = engine.callsTo("createRecord");
    expect(create.actor).toMatchObject({ outlineUserId: user.id });
    expect(create.args[0]).toEqual({
      fields: { fldStatus: "À faire", fldName: "Réunion" },
      order: { viewId: "viwBoard", anchorId: "rec9", position: "after" },
    });
    expect(body.data.record.id).toEqual("rec1");
    expect(body.data.record.documentId).toEqual(body.data.document.id);
    expect(body.data.document.title).toEqual("Réunion");
    expect(body.data.document.icon).toEqual("📋");
    expect(body.data.document.text).toContain("Ordre du jour");
    expect(body.data.document.databaseRecordId).toEqual("rec1");
    expect(body.policies[0].id).toEqual(body.data.document.id);
  });

  it("keeps the title given for the row", async () => {
    const template = await buildTemplate({
      teamId: user.teamId,
      userId: user.id,
      title: "Réunion",
    });

    const res = await server.post(
      "/api/databaseRecords.createFromTemplate",
      user,
      {
        body: {
          databaseId: database.id,
          templateId: template.id,
          fields: { fldName: "Point hebdo" },
        },
      }
    );
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.document.title).toEqual("Point hebdo");
    const [create] = engine.callsTo("createRecord");
    expect(create.args[0]).toMatchObject({
      fields: { fldName: "Point hebdo" },
    });
  });

  it("refuses a template the user cannot read", async () => {
    const other = await buildUser();
    const template = await buildTemplate({
      teamId: other.teamId,
      userId: other.id,
    });

    const res = await server.post(
      "/api/databaseRecords.createFromTemplate",
      user,
      { body: { databaseId: database.id, templateId: template.id } }
    );

    expect(res.status).toEqual(403);
    expect(engine.callsTo("createRecord")).toHaveLength(0);
  });

  it("refuses a reader of the database", async () => {
    const reader = await buildUser({ teamId: user.teamId });
    const readOnly = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
      permission: CollectionPermission.Read,
    });
    const readOnlyDatabase = await buildDatabase({
      teamId: user.teamId,
      collectionId: readOnly.id,
    });
    const template = await buildTemplate({
      teamId: user.teamId,
      userId: user.id,
    });

    const res = await server.post(
      "/api/databaseRecords.createFromTemplate",
      reader,
      { body: { databaseId: readOnlyDatabase.id, templateId: template.id } }
    );

    expect(res.status).toEqual(403);
    expect(engine.callsTo("createRecord")).toHaveLength(0);
  });
});

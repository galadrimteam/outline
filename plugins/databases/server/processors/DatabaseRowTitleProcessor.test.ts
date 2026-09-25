import { Document } from "@server/models";
import type { Database, User } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import type { DocumentEvent } from "@server/types";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { DatabaseRowTitleProcessor } from "./DatabaseRowTitleProcessor";

let engine: FakeEngine;
let origins: (string | null | undefined)[];
let user: User;
let database: Database;

beforeEach(async () => {
  engine = new FakeEngine();
  origins = [];
  setEngineFactory((_database, options) => {
    origins.push(options.origin);
    return engine;
  });
  user = await buildUser();
  const collection = await buildCollection({
    teamId: user.teamId,
    userId: user.id,
  });
  database = await buildDatabase({
    teamId: user.teamId,
    collectionId: collection.id,
  });
});

afterEach(() => {
  setEngineFactory();
});

async function buildRowPage(title: string, recordId = "rec1") {
  const document = await buildDocument({
    teamId: user.teamId,
    userId: user.id,
    collectionId: database.collectionId,
    title,
  });
  await Document.update(
    { databaseId: database.id, databaseRecordId: recordId },
    { where: { id: document.id } }
  );
  return document;
}

function titleChange(documentId: string, actorId = user.id): DocumentEvent {
  return {
    name: "documents.title_change",
    documentId,
    collectionId: database.collectionId,
    teamId: user.teamId,
    actorId,
    ip: null,
    createdAt: new Date().toISOString(),
  };
}

describe("DatabaseRowTitleProcessor", () => {
  it("only queues title changes of row pages", async () => {
    const page = await buildRowPage("Card");
    const other = await buildDocument({ teamId: user.teamId, userId: user.id });

    expect(
      await DatabaseRowTitleProcessor.shouldQueue(titleChange(page.id))
    ).toBe(true);
    expect(
      await DatabaseRowTitleProcessor.shouldQueue(titleChange(other.id))
    ).toBe(false);
    expect(
      await DatabaseRowTitleProcessor.shouldQueue({
        name: "documents.update",
        documentId: page.id,
        collectionId: database.collectionId,
        teamId: user.teamId,
        actorId: user.id,
        ip: null,
        createdAt: new Date().toISOString(),
      })
    ).toBe(false);
  });

  it("writes the page title into the primary field as the user, tagged outline", async () => {
    engine.addRecord("rec1", { fldName: "Old" });
    const page = await buildRowPage("New");

    await new DatabaseRowTitleProcessor().perform(titleChange(page.id));

    const [update] = engine.callsTo("updateRecord");
    expect(update.actor).toMatchObject({ outlineUserId: user.id });
    expect(update.args).toEqual(["rec1", { fields: { fldName: "New" } }]);
    expect(origins).toEqual(["outline"]);
  });

  it("does nothing when the row already has the title", async () => {
    engine.addRecord("rec1", { fldName: "Same" });
    const page = await buildRowPage("Same");

    await new DatabaseRowTitleProcessor().perform(titleChange(page.id));

    expect(engine.callsTo("updateRecord")).toHaveLength(0);
  });

  it("leaves a computed primary field alone", async () => {
    engine.fields[0].isComputed = true;
    engine.addRecord("rec1", { fldName: "Formula" });
    const page = await buildRowPage("Typed");

    await new DatabaseRowTitleProcessor().perform(titleChange(page.id));

    expect(engine.callsTo("updateRecord")).toHaveLength(0);
  });

  it("ignores a user of another team", async () => {
    engine.addRecord("rec1", { fldName: "Old" });
    const page = await buildRowPage("New");
    const stranger = await buildUser();

    await new DatabaseRowTitleProcessor().perform(
      titleChange(page.id, stranger.id)
    );

    expect(engine.calls).toHaveLength(0);
  });
});

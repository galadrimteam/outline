import { Document } from "@server/models";
import type { Database, User } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import type { DatabaseEvent } from "@server/types";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { DatabaseChangeTitleProcessor } from "./DatabaseChangeTitleProcessor";

let engine: FakeEngine;
let user: User;
let database: Database;

beforeEach(async () => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
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

function change(
  after: string,
  overrides: Partial<DatabaseEvent["data"]> & { actorId?: string } = {}
): DatabaseEvent {
  const { actorId = user.id, ...data } = overrides;
  return {
    name: "databases.change",
    modelId: database.id,
    teamId: database.teamId,
    actorId,
    collectionId: database.collectionId,
    documentId: null,
    data: {
      kinds: ["record.update"],
      recordIds: ["rec1"],
      origin: "app",
      changes: [{ recordId: "rec1", fieldId: "fldName", before: "Old", after }],
      ...data,
    },
  };
}

describe("DatabaseChangeTitleProcessor", () => {
  it("skips changes made by Outline itself", async () => {
    expect(
      await DatabaseChangeTitleProcessor.shouldQueue(
        change("New", { origin: "outline" })
      )
    ).toBe(false);
    expect(await DatabaseChangeTitleProcessor.shouldQueue(change("New"))).toBe(
      true
    );
  });

  it("renames the row's page as the person who renamed the row", async () => {
    const page = await buildRowPage("Old");
    const author = await buildUser({ teamId: user.teamId });

    await new DatabaseChangeTitleProcessor().perform(
      change("New", { actorId: author.id })
    );

    const reloaded = await Document.findByPk(page.id);
    expect(reloaded?.title).toEqual("New");
    expect(reloaded?.lastModifiedById).toEqual(author.id);
  });

  it("renames silently when the author is not a member of the team", async () => {
    const page = await buildRowPage("Old");
    const { updatedAt } = await Document.findByPk(page.id, {
      rejectOnEmpty: true,
    });

    await new DatabaseChangeTitleProcessor().perform(
      change("From Teable", { actorId: "" })
    );

    const reloaded = await Document.findByPk(page.id);
    expect(reloaded?.title).toEqual("From Teable");
    expect(reloaded?.updatedAt).toEqual(updatedAt);
  });

  it("ignores changes of other fields and rows without a page", async () => {
    const page = await buildRowPage("Old");

    await new DatabaseChangeTitleProcessor().perform(
      change("Ignored", {
        changes: [
          { recordId: "rec1", fieldId: "fldStatus", before: "A", after: "B" },
          { recordId: "rec2", fieldId: "fldName", before: "x", after: "y" },
        ],
      })
    );

    const reloaded = await Document.findByPk(page.id);
    expect(reloaded?.title).toEqual("Old");
  });
});

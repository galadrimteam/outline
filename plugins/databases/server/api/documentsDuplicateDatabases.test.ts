import type { DatabaseCellValue } from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import type { ProsemirrorData } from "@shared/types";
import { databaseRowDocumentCreator } from "@server/commands/databaseRowDocumentCreator";
import { Database, Document } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { engineFor, refFor } from "../engine";
import { FakeTablesDuplicator } from "../engine/__mocks__/FakeTablesDuplicator";
import { setTablesDuplicatorFactory } from "../engine/tablesDuplicator";
import { presentDatabaseRecords } from "../presenters/databaseRecords";
import { actorFor } from "../utils/actor";

const server = getTestServer();

let duplicator: FakeTablesDuplicator;

beforeEach(() => {
  duplicator = new FakeTablesDuplicator();
  setTablesDuplicatorFactory(() => duplicator);
});

afterEach(() => {
  setTablesDuplicatorFactory();
});

describe("#documents.duplicate with databases", () => {
  it("gives the copy its own database", async () => {
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
    });
    page.content = {
      type: "doc",
      content: [
        {
          type: "database",
          attrs: {
            id: "blk1",
            databaseId: database.id,
            viewIds: ["viwBoard"],
            fullPage: false,
            legacyHref: null,
            title: "Suivi",
          },
        },
      ],
    };
    await page.save();

    const res = await server.post("/api/documents.duplicate", user, {
      body: { id: page.id, title: "Copie" },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    const [copy] = body.data.documents;
    const copied = await Database.findOne({
      where: { documentId: copy.id },
      rejectOnEmpty: true,
    });
    expect(JSON.stringify(copy.data ?? copy.text)).toContain(copied.id);
    expect(duplicator.calls).toHaveLength(1);
    expect(duplicator.calls[0].input.withRecords).toBe(true);
  });

  it("copies the rows of Outline engine databases, their relations and their pages", async () => {
    setTablesDuplicatorFactory();
    const user = await buildUser();
    const actor = actorFor(user);
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const page = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });
    const engine = engineFor({ engine: "outline", teamId: user.teamId });
    const baseId = await engine.createBase("Chantier");
    const table = (name: string) =>
      engine.createTable(actor, baseId, {
        name,
        fields: [
          { key: "name", name: "Nom", type: DatabaseFieldType.SingleLineText },
        ],
        view: { name: "Table", layout: DatabaseLayout.Table },
      });
    const lots = await table("Lots");
    const tasks = await table("Tâches");
    const [lotsDb, tasksDb] = await Promise.all(
      [lots, tasks].map((created, index) =>
        buildDatabase({
          teamId: user.teamId,
          documentId: page.id,
          engine: "outline",
          title: index ? "Tâches" : "Lots",
          externalBaseId: baseId,
          externalTableId: created.externalTableId,
        })
      )
    );
    const lot = await engine.createField(actor, refFor(tasksDb), {
      name: "Lot",
      type: DatabaseFieldType.Link,
      options: {
        foreignTableId: lots.externalTableId,
        relationship: "manyOne",
      },
    });
    const roof = await engine.createRecord(actor, refFor(lotsDb), {
      fields: { [lots.fieldIds.name]: "Toiture" },
    });
    const tiles = await engine.createRecord(actor, refFor(tasksDb), {
      fields: {
        [tasks.fieldIds.name]: "Poser les tuiles",
        [lot.id]: [{ id: roof.id }],
      },
    });
    const rowPage = await databaseRowDocumentCreator(
      { user },
      { database: tasksDb, recordId: tiles.id, title: "Poser les tuiles" }
    );
    rowPage.content = paragraphs("Commencer par le faîtage");
    await rowPage.save();
    page.content = {
      type: "doc",
      content: [lotsDb, tasksDb].map((database) => ({
        type: "database",
        attrs: {
          id: `blk${database.id}`,
          databaseId: database.id,
          viewIds: null,
          fullPage: false,
          legacyHref: null,
          title: database.title,
        },
      })),
    };
    await page.save();

    const res = await server.post("/api/documents.duplicate", user, {
      body: { id: page.id, title: "Copie" },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    const [copy] = body.data.documents;
    const copied = await Database.findAll({ where: { documentId: copy.id } });
    const lotsCopy = copied.find((database) => database.title === "Lots");
    const tasksCopy = copied.find((database) => database.title === "Tâches");
    if (!lotsCopy || !tasksCopy) {
      throw new Error("The databases were not copied");
    }
    const records = async (database: Database) =>
      (await engine.listRecords(actor, refFor(database), { skip: 0, take: 10 }))
        .records;
    const [roofCopy] = await records(lotsCopy);
    const [tilesCopy] = await records(tasksCopy);
    expect(roofCopy.id).not.toEqual(roof.id);
    expect(tilesCopy.id).not.toEqual(tiles.id);
    const { fields } = await engine.getSchema(actor, refFor(tasksCopy));
    const fieldId = (name: string) =>
      fields.find((field) => field.name === name)?.id ?? "";
    expect(tilesCopy.fields[fieldId("Nom")]).toEqual("Poser les tuiles");
    expect(linkedIds(tilesCopy.fields[fieldId("Lot")])).toEqual([roofCopy.id]);

    const [presented] = await presentDatabaseRecords(tasksCopy, [tilesCopy]);
    const pageCopy = await Document.unscoped().findByPk(
      presented.documentId ?? "",
      { rejectOnEmpty: true }
    );
    expect(pageCopy).toMatchObject({
      databaseId: tasksCopy.id,
      databaseRecordId: tilesCopy.id,
      parentDocumentId: copy.id,
      title: "Poser les tuiles",
    });
    expect(pageCopy.text).toContain("Commencer par le faîtage");

    const [original] = await presentDatabaseRecords(tasksDb, [
      await engine.getRecord(actor, refFor(tasksDb), tiles.id),
    ]);
    expect(original.documentId).toEqual(rowPage.id);
    expect(
      await Document.unscoped().count({ where: { databaseId: tasksDb.id } })
    ).toEqual(1);
  });
});

function paragraphs(...texts: string[]): ProsemirrorData {
  return {
    type: "doc",
    content: texts.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function linkedIds(value: DatabaseCellValue | undefined): string[] {
  const items: unknown[] = Array.isArray(value) ? value : value ? [value] : [];
  return items.flatMap((item) =>
    typeof item === "object" && item !== null && "id" in item
      ? [String(item.id)]
      : []
  );
}

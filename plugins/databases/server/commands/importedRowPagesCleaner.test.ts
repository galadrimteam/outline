import type { ProsemirrorData } from "@shared/types";
import { Document, Revision } from "@server/models";
import {
  buildAdmin,
  buildCollection,
  buildDatabase,
  buildDocument,
} from "@server/test/factories";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { importedRowPagesCleaner } from "./importedRowPagesCleaner";

const whole =
  "ETQJU, dans un document, je peux mentionner un autre document par nom ou référence et afficher ce document sur le côté";
const cut = `${whole.slice(0, 97)}…`;
const propertyTable =
  "| Propriété | Valeur |\n|---|---|\n| Status | En pause |\n| Person | Ada |";

let engine: FakeEngine;

beforeEach(() => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
});

afterEach(() => {
  setEngineFactory();
});

async function setup() {
  const admin = await buildAdmin();
  const collection = await buildCollection({
    teamId: admin.teamId,
    userId: admin.id,
  });
  const database = await buildDatabase({
    teamId: admin.teamId,
    collectionId: collection.id,
  });
  const row = (
    recordId: string,
    title: string,
    text: string,
    content?: ProsemirrorData
  ) =>
    buildDocument({
      teamId: admin.teamId,
      userId: admin.id,
      collectionId: collection.id,
      databaseId: database.id,
      databaseRecordId: recordId,
      title,
      text,
      ...(content ? { content } : {}),
    });
  return { admin, collection, database, row };
}

describe("importedRowPagesCleaner", () => {
  it("gives the page its whole title and drops the property table, once", async () => {
    const { admin, database, row } = await setup();
    engine.addRecord("recLong", { fldName: whole });
    const page = await row(
      "recLong",
      cut,
      `**${whole}**\n\n${propertyTable}\n\n[*Description*]`
    );

    const dry = await importedRowPagesCleaner(admin, database, {
      dryRun: true,
    });
    expect(dry).toEqual({
      pages: 1,
      titles: 1,
      tables: 1,
      failed: 0,
      documentIds: [page.id],
      next: null,
    });
    expect((await Document.findByPk(page.id))?.title).toEqual(cut);

    const done = await importedRowPagesCleaner(admin, database);
    expect(done).toEqual(dry);
    const cleaned = await Document.findByPk(page.id);
    expect(cleaned?.title).toEqual(whole);
    expect(cleaned?.text.trim()).toEqual("[*Description*]");
    expect(await Revision.count({ where: { documentId: page.id } })).toEqual(1);

    expect(await importedRowPagesCleaner(admin, database)).toEqual({
      pages: 1,
      titles: 0,
      tables: 0,
      failed: 0,
      documentIds: [],
      next: null,
    });
  });

  it("leaves a table someone wrote, and the pages of other databases", async () => {
    const { admin, collection, database, row } = await setup();
    engine.addRecord("recMine", { fldName: "Mine" });
    const mine = await row(
      "recMine",
      "Mine",
      "| Propriété | Valeur |\n|---|---|\n| Budget | 3 |"
    );
    const other = await buildDocument({
      teamId: admin.teamId,
      userId: admin.id,
      collectionId: collection.id,
      text: propertyTable,
    });

    const result = await importedRowPagesCleaner(admin, database, {
      documentIds: [mine.id, other.id],
    });

    expect(result).toMatchObject({ pages: 1, tables: 0, documentIds: [] });
    expect((await Document.findByPk(mine.id))?.text).toContain("Budget");
    expect((await Document.findByPk(other.id))?.text).toContain("Propriété");
  });

  it("goes on past a page it cannot change", async () => {
    const { admin, database, row } = await setup();
    const broken = await row("recBroken", "Broken", "", {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tr",
              content: ["Propriété", "Valeur"].map((value) => ({
                type: "th",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: value }],
                  },
                ],
              })),
            },
            {
              type: "tr",
              content: ["Status", "x"].map((value) => ({
                type: "td",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: value }],
                  },
                ],
              })),
            },
          ],
        },
        { type: "notANode" },
      ],
    });
    const fine = await row("recFine", "Fine", `${propertyTable}\n\nBody`);

    const result = await importedRowPagesCleaner(admin, database, {
      documentIds: [broken.id, fine.id],
    });

    expect(result).toMatchObject({
      pages: 2,
      tables: 1,
      failed: 1,
      documentIds: [fine.id],
    });
    expect((await Document.findByPk(fine.id))?.text.trim()).toEqual("Body");
  });

  it("goes through the row pages a slice at a time", async () => {
    const { admin, database, row } = await setup();
    const first = await row("recA", "A", `${propertyTable}\n\nA`);
    const second = await row("recB", "B", `${propertyTable}\n\nB`);

    const head = await importedRowPagesCleaner(admin, database, {
      limit: 1,
      dryRun: true,
    });
    const tail = await importedRowPagesCleaner(admin, database, {
      offset: 1,
      limit: 1,
      dryRun: true,
    });

    expect(head.next).toEqual(1);
    expect(tail.next).toEqual(2);
    expect([...head.documentIds, ...tail.documentIds].sort()).toEqual(
      [first.id, second.id].sort()
    );
    expect(
      await importedRowPagesCleaner(admin, database, { offset: 2, limit: 1 })
    ).toMatchObject({ pages: 0, next: null });
  });
});

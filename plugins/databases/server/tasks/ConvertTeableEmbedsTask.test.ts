import { Node } from "prosemirror-model";
import { yDocToProsemirrorJSON } from "y-prosemirror";
import type { MockInstance } from "vitest";
import * as Y from "yjs";
import type { ProsemirrorData } from "@shared/types";
import { APIUpdateExtension } from "@server/collaboration/APIUpdateExtension";
import { schema } from "@server/editor";
import type { Collection, User } from "@server/models";
import { Database, Document, Event } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { ProsemirrorHelper } from "@server/models/helpers/ProsemirrorHelper";
import {
  buildAdmin,
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { ConvertTeableEmbedsTask } from "./ConvertTeableEmbedsTask";

const past = new Date("2024-01-01T00:00:00.000Z");

const framed = (tableId: string, viewId = "viw1", baseId = "bse1") =>
  `https://teable.notion-exit.galadrim.fr/framed?u=/base/${baseId}/table/${tableId}/${viewId}`;

const youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const embed = (href: string): ProsemirrorData => ({
  type: "embed",
  attrs: { href, width: null, height: 720 },
});

const paragraph = (text?: string): ProsemirrorData =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };

const doc = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

const nodesOf = (content: ProsemirrorData | null, type: string) =>
  (content?.content ?? []).filter((node) => node.type === type);

const contentOfState = (state: Uint8Array | null | undefined) => {
  if (!state) {
    throw new Error("no collaborative state");
  }
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  return Node.fromJSON(schema, yDocToProsemirrorJSON(ydoc, "default")).toJSON();
};

async function setup() {
  const admin = await buildAdmin();
  const collection = await buildCollection({
    teamId: admin.teamId,
    userId: admin.id,
  });
  return { admin, collection };
}

async function buildPage(
  { admin, collection }: { admin: User; collection: Collection },
  content: ProsemirrorData,
  title = "Suivi",
  createdAt = past
) {
  return buildDocument({
    teamId: admin.teamId,
    userId: admin.id,
    collectionId: collection.id,
    title,
    content,
    state: ProsemirrorHelper.toState(ProsemirrorHelper.toYDoc(content)),
    createdAt,
    updatedAt: past,
  });
}

const databaseIdOf = (node: ProsemirrorData) => {
  const databaseId = node.attrs?.databaseId;
  if (typeof databaseId !== "string") {
    throw new Error("no database id");
  }
  return databaseId;
};

const reload = (id: string) =>
  Document.unscoped().findOne({ where: { id }, rejectOnEmpty: true });

describe("ConvertTeableEmbedsTask", () => {
  let notifyUpdate: MockInstance<typeof APIUpdateExtension.notifyUpdate>;

  beforeEach(() => {
    notifyUpdate = vi
      .spyOn(APIUpdateExtension, "notifyUpdate")
      .mockResolvedValue();
    const engine = new FakeEngine();
    vi.spyOn(engine, "describeTable").mockImplementation(async (_, ref) => ({
      name: `Table ${ref.externalTableId}`,
    }));
    setEngineFactory(() => engine);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setEngineFactory();
  });

  it("converts an embed through the collaborative state, silently", async () => {
    const context = await setup();
    const page = await buildPage(
      context,
      doc(paragraph("Intro"), embed(framed("tblA")), embed(youtube))
    );

    const result = await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: page.id,
    });

    expect(result).toMatchObject({
      changedDocuments: 1,
      convertedEmbeds: 1,
      createdDatabases: 1,
    });

    const database = await Database.findOne({
      where: { teamId: context.admin.teamId, externalTableId: "tblA" },
      rejectOnEmpty: true,
    });
    expect(database).toMatchObject({
      externalBaseId: "bse1",
      engine: "teable",
      collectionId: context.collection.id,
      documentId: page.id,
      createdById: context.admin.id,
    });

    const document = await reload(page.id);
    const [node] = nodesOf(document.content, "database");
    expect(node.attrs).toMatchObject({
      databaseId: database.id,
      viewIds: ["viw1"],
      fullPage: false,
      legacyHref: framed("tblA"),
    });
    expect(nodesOf(document.content, "embed")).toEqual([embed(youtube)]);
    // A page that shows a database among other blocks keeps its width, as in Notion.
    expect(document.fullWidth).toBe(false);
    expect(contentOfState(document.state)).toEqual(document.content);
    expect(document.updatedAt).toEqual(past);
    expect(await Event.count({ where: { documentId: page.id } })).toBe(0);
    expect(notifyUpdate).toHaveBeenCalledWith(page.id, context.admin.id);
  });

  it("changes nothing on a second run", async () => {
    const context = await setup();
    const page = await buildPage(
      context,
      doc(paragraph("Intro"), embed(framed("tblA")))
    );
    const task = new ConvertTeableEmbedsTask();
    await task.perform({ teamId: context.admin.teamId, documentId: page.id });
    const before = await reload(page.id);

    const result = await task.perform({
      teamId: context.admin.teamId,
      documentId: page.id,
    });

    expect(result.convertedEmbeds).toBe(0);
    expect(result.createdDatabases).toBe(0);
    const after = await reload(page.id);
    expect(after.content).toEqual(before.content);
    expect(after.revisionCount).toBe(before.revisionCount);
    expect(
      await Database.count({ where: { teamId: context.admin.teamId } })
    ).toBe(1);
  });

  it("makes the only embed of a page a full-page database anchored there", async () => {
    const context = await setup();
    const page = await buildPage(
      context,
      doc(paragraph(), embed(framed("tblA"))),
      "Kanban dev"
    );

    await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: page.id,
    });

    const document = await reload(page.id);
    expect(document.fullWidth).toBe(true);
    const [node] = nodesOf(document.content, "database");
    expect(node.attrs).toMatchObject({
      viewIds: null,
      fullPage: true,
      title: "Kanban dev",
    });
    const database = await Database.findByPk(databaseIdOf(node), {
      rejectOnEmpty: true,
    });
    expect(database.documentId).toBe(page.id);
    expect(database.title).toBe("Kanban dev");
  });

  it("anchors a table embedded in several pages to the page it fills", async () => {
    const context = await setup();
    const linked = await buildPage(
      context,
      doc(paragraph("See"), embed(framed("tblA", "viw2")))
    );
    const home = await buildPage(context, doc(embed(framed("tblA"))), "Home");

    const result = await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      collectionId: context.collection.id,
    });

    expect(result).toMatchObject({
      changedDocuments: 2,
      convertedEmbeds: 2,
      createdDatabases: 1,
    });
    const database = await Database.findOne({
      where: { teamId: context.admin.teamId, externalTableId: "tblA" },
      rejectOnEmpty: true,
    });
    expect(database.documentId).toBe(home.id);
    const [node] = nodesOf((await reload(linked.id)).content, "database");
    expect(node.attrs).toMatchObject({
      databaseId: database.id,
      viewIds: ["viw2"],
    });
  });

  it("anchors a table shown inline in several pages to the collection", async () => {
    const context = await setup();
    const first = await buildPage(
      context,
      doc(paragraph("One"), embed(framed("tblA")))
    );
    await buildPage(context, doc(paragraph("Two"), embed(framed("tblA"))));

    await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: first.id,
    });

    const database = await Database.findOne({
      where: { teamId: context.admin.teamId, externalTableId: "tblA" },
      rejectOnEmpty: true,
    });
    expect(database.collectionId).toBe(context.collection.id);
    expect(database.documentId).toBeNull();
  });

  it("reuses a registered database and leaves an embed of another base", async () => {
    const context = await setup();
    const database = await buildDatabase({
      teamId: context.admin.teamId,
      collectionId: context.collection.id,
      externalBaseId: "bse1",
      externalTableId: "tblA",
    });
    const forged = framed("tblA", "viw1", "bseOther");
    const page = await buildPage(
      context,
      doc(paragraph("Intro"), embed(framed("tblA")), embed(forged))
    );

    const result = await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: page.id,
    });

    expect(result).toMatchObject({ convertedEmbeds: 1, createdDatabases: 0 });
    const document = await reload(page.id);
    expect(nodesOf(document.content, "database")[0].attrs?.databaseId).toBe(
      database.id
    );
    expect(nodesOf(document.content, "embed")).toEqual([embed(forged)]);
  });

  it("anchors a database registered on its collection under its row pages' parent", async () => {
    const context = await setup();
    const home = await buildPage(
      context,
      doc(paragraph("Description"), embed(framed("tblA")))
    );
    const database = await buildDatabase({
      teamId: context.admin.teamId,
      collectionId: context.collection.id,
      externalBaseId: "bse1",
      externalTableId: "tblA",
    });
    await buildDocument({
      teamId: context.admin.teamId,
      userId: context.admin.id,
      collectionId: context.collection.id,
      parentDocumentId: home.id,
      databaseId: database.id,
      databaseRecordId: "rec1",
    });

    await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: home.id,
    });

    await database.reload();
    expect(database.documentId).toBe(home.id);
  });

  it("names databases shown inline after their table, not after the page holding their rows", async () => {
    const context = await setup();
    const page = await buildPage(
      context,
      doc(
        paragraph("Logs"),
        embed(framed("tblA")),
        paragraph("Parcours"),
        embed(framed("tblB"))
      ),
      "Journal de Test"
    );
    for (const tableId of ["tblA", "tblB"]) {
      const earlier = await buildDatabase({
        teamId: context.admin.teamId,
        collectionId: context.collection.id,
        externalBaseId: "bse1",
        externalTableId: tableId,
      });
      await buildDocument({
        teamId: context.admin.teamId,
        userId: context.admin.id,
        collectionId: context.collection.id,
        parentDocumentId: page.id,
        databaseId: earlier.id,
        databaseRecordId: `rec-${tableId}`,
      });
      await earlier.destroy();
    }

    await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: page.id,
    });

    const databases = await Database.findAll({
      where: { teamId: context.admin.teamId },
      order: [["externalTableId", "ASC"]],
    });
    expect(
      databases.map((database) => [database.title, database.documentId])
    ).toEqual([
      ["Table tblA", page.id],
      ["Table tblB", page.id],
    ]);
  });

  it("rolls back a failed document and goes on with the others", async () => {
    const context = await setup();
    const failing = await buildPage(
      context,
      doc(paragraph("One"), embed(framed("tblA"))),
      "One",
      new Date("2023-01-01T00:00:00.000Z")
    );
    const other = await buildPage(
      context,
      doc(paragraph("Two"), embed(framed("tblB")))
    );
    vi.spyOn(
      DocumentHelper,
      "applyProsemirrorToDocument"
    ).mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const result = await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      collectionId: context.collection.id,
    });

    expect(result).toMatchObject({
      failed: 1,
      changedDocuments: 1,
      createdDatabases: 1,
    });
    expect(nodesOf((await reload(failing.id)).content, "embed")).toHaveLength(
      1
    );
    expect(nodesOf((await reload(other.id)).content, "database")).toHaveLength(
      1
    );
    expect(
      await Database.findAll({ where: { teamId: context.admin.teamId } })
    ).toEqual([expect.objectContaining({ externalTableId: "tblB" })]);
  });

  it("converts collection overviews with a plain save", async () => {
    const context = await setup();
    context.collection.content = doc(paragraph(), embed(framed("tblA")));
    await context.collection.save({ silent: true });

    const result = await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      collectionId: context.collection.id,
    });

    expect(result).toMatchObject({
      changedCollections: 1,
      convertedEmbeds: 1,
      createdDatabases: 1,
    });
    await context.collection.reload();
    const [node] = nodesOf(context.collection.content, "database");
    expect(node.attrs).toMatchObject({ fullPage: true, viewIds: null });
    const database = await Database.findByPk(databaseIdOf(node), {
      rejectOnEmpty: true,
    });
    expect(database.collectionId).toBe(context.collection.id);
    expect(database.documentId).toBeNull();
    expect(database.title).toBe(context.collection.name);
  });

  it("only counts on a dry run", async () => {
    const context = await setup();
    const page = await buildPage(
      context,
      doc(paragraph("Intro"), embed(framed("tblA")))
    );

    const result = await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: page.id,
      dryRun: true,
    });

    expect(result).toMatchObject({
      changedDocuments: 1,
      convertedEmbeds: 1,
      createdDatabases: 1,
    });
    expect(nodesOf((await reload(page.id)).content, "embed")).toHaveLength(1);
    expect(
      await Database.count({ where: { teamId: context.admin.teamId } })
    ).toBe(0);
  });

  it("does not register tables for a member", async () => {
    const context = await setup();
    const member = await buildUser({ teamId: context.admin.teamId });
    const database = await buildDatabase({
      teamId: context.admin.teamId,
      collectionId: context.collection.id,
      externalBaseId: "bse1",
      externalTableId: "tblKnown",
    });
    const page = await buildPage(
      context,
      doc(
        paragraph("Intro"),
        embed(framed("tblKnown")),
        embed(framed("tblUnknown"))
      )
    );

    const result = await new ConvertTeableEmbedsTask().perform({
      teamId: context.admin.teamId,
      documentId: page.id,
      actorId: member.id,
    });

    expect(result).toMatchObject({ convertedEmbeds: 1, createdDatabases: 0 });
    const document = await reload(page.id);
    expect(nodesOf(document.content, "database")[0].attrs?.databaseId).toBe(
      database.id
    );
    expect(nodesOf(document.content, "embed")).toEqual([
      embed(framed("tblUnknown")),
    ]);
  });
});

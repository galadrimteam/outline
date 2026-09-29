import type { ProsemirrorData } from "@shared/types";
import documentDuplicator from "@server/commands/documentDuplicator";
import { Collection, Database, Document } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import { withAPIContext } from "@server/test/support";
import { FakeTablesDuplicator } from "../engine/__mocks__/FakeTablesDuplicator";
import { setTablesDuplicatorFactory } from "../engine/tablesDuplicator";
import { databaseIdsIn } from "../utils/databaseNodes";
import { documentDatabasesDuplicator } from "./documentDatabasesDuplicator";

let duplicator: FakeTablesDuplicator;

beforeEach(() => {
  duplicator = new FakeTablesDuplicator();
  setTablesDuplicatorFactory(() => duplicator);
});

afterEach(() => {
  setTablesDuplicatorFactory();
});

function databaseNode(
  databaseId: string,
  options: { viewIds?: string[]; fullPage?: boolean } = {}
): ProsemirrorData {
  return {
    type: "database",
    attrs: {
      id: `block-${databaseId}`,
      databaseId,
      viewIds: options.viewIds ?? null,
      fullPage: options.fullPage ?? false,
      legacyHref: null,
      title: "Base",
    },
  };
}

function docWith(...nodes: ProsemirrorData[]): ProsemirrorData {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Projet" }] },
      ...nodes,
    ],
  };
}

/**
 * A project page holding its « Suivi » board and a linked view of the
 * « Epics » full-page database below it, plus a linked view of a database
 * that lives elsewhere.
 */
async function setup() {
  const user = await buildUser();
  const collection = await buildCollection({
    teamId: user.teamId,
    userId: user.id,
  });
  const elsewhere = await buildDocument({
    teamId: user.teamId,
    userId: user.id,
    collectionId: collection.id,
  });
  const shared = await buildDatabase({
    teamId: user.teamId,
    documentId: elsewhere.id,
  });
  const project = await buildDocument({
    teamId: user.teamId,
    userId: user.id,
    collectionId: collection.id,
    title: "Modèle projet",
  });
  const epicsPage = await buildDocument({
    teamId: user.teamId,
    userId: user.id,
    collectionId: collection.id,
    parentDocumentId: project.id,
    title: "Epics",
  });
  const suivi = await buildDatabase({
    teamId: user.teamId,
    documentId: project.id,
    externalBaseId: "bseProject",
    title: "Suivi",
  });
  const epics = await buildDatabase({
    teamId: user.teamId,
    documentId: epicsPage.id,
    externalBaseId: "bseProject",
    title: "Epics",
  });

  project.content = docWith(
    databaseNode(suivi.id),
    databaseNode(epics.id, { viewIds: ["viwBoard"] }),
    databaseNode(shared.id)
  );
  await project.save();
  epicsPage.content = docWith(databaseNode(epics.id, { fullPage: true }));
  await epicsPage.save();

  return { user, collection, project, epicsPage, suivi, epics, shared };
}

describe("documentDatabasesDuplicator", () => {
  it("gives a duplicated project its own databases, linked together", async () => {
    const { user, collection, project, suivi, epics, shared } = await setup();

    const { copies, count } = await withAPIContext(user, async (ctx) => {
      const duplicated = await documentDuplicator(ctx, {
        document: project,
        collection,
        recursive: true,
      });
      return {
        copies: duplicated,
        count: await documentDatabasesDuplicator({
          user,
          documents: duplicated,
          transaction: ctx.state.transaction,
        }),
      };
    });

    expect(count).toEqual(2);
    expect(duplicator.calls).toHaveLength(1);
    expect(duplicator.calls[0].input.externalBaseId).toEqual("bseProject");
    expect(
      duplicator.calls[0].input.tables.map((table) => table.externalTableId)
    ).toEqual(
      expect.arrayContaining([suivi.externalTableId, epics.externalTableId])
    );

    const projectCopyId =
      copies.find(
        (document) => document.sourceMetadata?.originalDocumentId === project.id
      )?.id ?? "";
    const epicsCopyId =
      copies.find(
        (document) => document.sourceMetadata?.originalDocumentId !== project.id
      )?.id ?? "";
    const suiviCopy = await Database.findOne({
      where: { documentId: projectCopyId },
      rejectOnEmpty: true,
    });
    const epicsDatabaseCopy = await Database.findOne({
      where: { documentId: epicsCopyId },
      rejectOnEmpty: true,
    });
    expect(suiviCopy.title).toEqual("Suivi");
    expect(suiviCopy.collectionId).toEqual(collection.id);
    expect(epicsDatabaseCopy.title).toEqual("Epics");

    const projectContent = (
      await Document.unscoped().findByPk(projectCopyId, {
        rejectOnEmpty: true,
      })
    ).content;
    expect(projectContent && databaseIdsIn(projectContent)).toEqual([
      suiviCopy.id,
      epicsDatabaseCopy.id,
      shared.id,
    ]);
    const linkedView = projectContent?.content?.[2];
    expect(linkedView?.attrs?.viewIds).toEqual([
      duplicator.calls[0].input.tables[0].externalTableId ===
      epics.externalTableId
        ? "viwBoardCopy1"
        : "viwBoardCopy2",
    ]);

    const returned = copies.find((document) => document.id === projectCopyId);
    expect(returned?.content && databaseIdsIn(returned.content)).toEqual([
      suiviCopy.id,
      epicsDatabaseCopy.id,
      shared.id,
    ]);

    const epicsContent = (
      await Document.unscoped().findByPk(epicsCopyId, { rejectOnEmpty: true })
    ).content;
    expect(epicsContent && databaseIdsIn(epicsContent)).toEqual([
      epicsDatabaseCopy.id,
    ]);

    const sourceContent = (
      await Document.unscoped().findByPk(project.id, { rejectOnEmpty: true })
    ).content;
    expect(sourceContent && databaseIdsIn(sourceContent)).toEqual([
      suivi.id,
      epics.id,
      shared.id,
    ]);
  });

  it("copies the rows with their pages, each page on the copied row", async () => {
    const { user, collection, project, suivi, epics } = await setup();
    const rowPage = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: project.id,
      databaseId: suivi.id,
      databaseRecordId: "recA",
      title: "Carte A",
      content: docWith(databaseNode(epics.id, { viewIds: ["viwGrid"] })),
    });

    const { copies, count } = await withAPIContext(user, async (ctx) => {
      const duplicated = await documentDuplicator(ctx, {
        document: project,
        collection,
        recursive: true,
      });
      return {
        copies: duplicated,
        count: await documentDatabasesDuplicator({
          user,
          documents: duplicated,
          withRecords: true,
          transaction: ctx.state.transaction,
        }),
      };
    });

    expect(count).toEqual(2);
    expect(duplicator.calls[0].input.withRecords).toBe(true);
    const projectCopyId =
      copies.find(
        (document) => document.sourceMetadata?.originalDocumentId === project.id
      )?.id ?? "";
    const suiviCopy = await Database.findOne({
      where: { documentId: projectCopyId, title: "Suivi" },
      rejectOnEmpty: true,
    });
    const epicsCopy = await Database.findOne({
      where: { title: "Epics", documentId: copies.map((copy) => copy.id) },
      rejectOnEmpty: true,
    });

    const [pageCopy] = await Document.unscoped().findAll({
      where: { databaseId: suiviCopy.id },
    });
    expect(pageCopy).toMatchObject({
      databaseRecordId: "recA",
      parentDocumentId: projectCopyId,
      collectionId: collection.id,
      title: "Carte A",
    });
    expect(pageCopy.publishedAt).not.toBeNull();
    expect(pageCopy.content && databaseIdsIn(pageCopy.content)).toEqual([
      epicsCopy.id,
    ]);
    expect(copies.map((document) => document.id)).not.toContain(pageCopy.id);

    const source = await Document.unscoped().findByPk(rowPage.id, {
      rejectOnEmpty: true,
    });
    expect(source).toMatchObject({
      databaseId: suivi.id,
      databaseRecordId: "recA",
    });
    expect(source.content && databaseIdsIn(source.content)).toEqual([epics.id]);
    const structure = JSON.stringify(
      (
        await Collection.findByPk(collection.id, {
          includeDocumentStructure: true,
          rejectOnEmpty: true,
        })
      ).documentStructure
    );
    expect(structure).toContain(projectCopyId);
    expect(structure).not.toContain(pageCopy.id);
  });

  it("puts each copied page on the row copied from its row, and leaves out pages of rows not copied", async () => {
    const { user, collection, project, suivi } = await setup();
    setTablesDuplicatorFactory(() => ({
      duplicateTables: async (actor, input) =>
        (await duplicator.duplicateTables(actor, input)).map((table) => ({
          ...table,
          recordIds: { recA: "recCopyA" },
        })),
    }));
    for (const recordId of ["recA", "recGone"]) {
      await buildDocument({
        teamId: user.teamId,
        userId: user.id,
        collectionId: collection.id,
        parentDocumentId: project.id,
        databaseId: suivi.id,
        databaseRecordId: recordId,
      });
    }

    const copies = await withAPIContext(user, async (ctx) => {
      const duplicated = await documentDuplicator(ctx, {
        document: project,
        collection,
      });
      await documentDatabasesDuplicator({
        user,
        documents: duplicated,
        withRecords: true,
        transaction: ctx.state.transaction,
      });
      return duplicated;
    });

    const suiviCopy = await Database.findOne({
      where: { documentId: copies[0].id },
      rejectOnEmpty: true,
    });
    const pages = await Document.unscoped().findAll({
      where: { databaseId: suiviCopy.id },
    });
    expect(pages.map((page) => page.databaseRecordId)).toEqual(["recCopyA"]);
  });

  it("copies no row page without the rows", async () => {
    const { user, collection, project, suivi } = await setup();
    await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: project.id,
      databaseId: suivi.id,
      databaseRecordId: "recA",
    });

    const copies = await withAPIContext(user, async (ctx) => {
      const duplicated = await documentDuplicator(ctx, {
        document: project,
        collection,
      });
      await documentDatabasesDuplicator({
        user,
        documents: duplicated,
        transaction: ctx.state.transaction,
      });
      return duplicated;
    });

    const suiviCopy = await Database.findOne({
      where: { documentId: copies[0].id },
      rejectOnEmpty: true,
    });
    expect(
      await Document.unscoped().count({ where: { databaseId: suiviCopy.id } })
    ).toEqual(0);
  });

  it("keeps a linked view when only the page showing it is duplicated", async () => {
    const { user, collection, project, suivi, epics } = await setup();

    const { copies, count } = await withAPIContext(user, async (ctx) => {
      const duplicated = await documentDuplicator(ctx, {
        document: project,
        collection,
        recursive: false,
      });
      return {
        copies: duplicated,
        count: await documentDatabasesDuplicator({
          user,
          documents: duplicated,
          transaction: ctx.state.transaction,
        }),
      };
    });

    expect(count).toEqual(1);
    const content = (
      await Document.unscoped().findByPk(copies[0].id, { rejectOnEmpty: true })
    ).content;
    const ids = content ? databaseIdsIn(content) : [];
    expect(ids).not.toContain(suivi.id);
    expect(ids).toContain(epics.id);
  });

  it("leaves documents without databases alone", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
    });

    const count = await withAPIContext(user, async (ctx) => {
      const duplicated = await documentDuplicator(ctx, {
        document,
        collection: document.collection,
      });
      return documentDatabasesDuplicator({
        user,
        documents: duplicated,
        transaction: ctx.state.transaction,
      });
    });

    expect(count).toEqual(0);
    expect(duplicator.calls).toHaveLength(0);
  });

  it("leaves every node as it was when the engine fails", async () => {
    const { user, collection, project, suivi } = await setup();
    setTablesDuplicatorFactory(() => ({
      duplicateTables: () => Promise.reject(new Error("Teable is down")),
    }));

    const { copies, count } = await withAPIContext(user, async (ctx) => {
      const duplicated = await documentDuplicator(ctx, {
        document: project,
        collection,
      });
      return {
        copies: duplicated,
        count: await documentDatabasesDuplicator({
          user,
          documents: duplicated,
          transaction: ctx.state.transaction,
        }),
      };
    });

    expect(count).toEqual(0);
    const content = (
      await Document.unscoped().findByPk(copies[0].id, { rejectOnEmpty: true })
    ).content;
    expect(content && databaseIdsIn(content)).toContain(suivi.id);
    expect(
      await Database.count({ where: { documentId: copies[0].id } })
    ).toEqual(0);
  });
});

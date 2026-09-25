import fs from "fs-extra";
import ZipHelper from "@server/utils/ZipHelper";
import {
  buildAdmin,
  buildCollection,
  buildDatabase,
  buildDocument,
  buildFileOperation,
  buildTeam,
} from "@server/test/factories";
import ExportMarkdownZipTask from "./ExportMarkdownZipTask";

async function listFiles(filePath: string): Promise<string[]> {
  const fileNames: string[] = [];
  try {
    await ZipHelper.walk(filePath, (entry) => {
      if (!entry.isDirectory) {
        fileNames.push(entry.fileName);
      }
    });
  } finally {
    await fs.remove(filePath);
  }
  return fileNames.sort();
}

async function setup() {
  const team = await buildTeam();
  const user = await buildAdmin({ teamId: team.id });
  const collection = await buildCollection({
    teamId: team.id,
    userId: user.id,
    name: "Projets",
  });
  const home = await buildDocument({
    teamId: team.id,
    userId: user.id,
    collectionId: collection.id,
    title: "Kanban",
  });
  await buildDocument({
    teamId: team.id,
    userId: user.id,
    collectionId: collection.id,
    parentDocumentId: home.id,
    title: "Notes",
  });
  const database = await buildDatabase({
    teamId: team.id,
    documentId: home.id,
  });
  const row = await buildDocument({
    teamId: team.id,
    userId: user.id,
    collectionId: collection.id,
    parentDocumentId: home.id,
    databaseId: database.id,
    databaseRecordId: "rec1",
    title: "Card",
  });
  await buildDocument({
    teamId: team.id,
    userId: user.id,
    collectionId: collection.id,
    parentDocumentId: row.id,
    title: "Detail",
  });
  await buildDocument({
    teamId: team.id,
    userId: user.id,
    collectionId: collection.id,
    parentDocumentId: home.id,
    databaseId: database.id,
    databaseRecordId: "rec2",
    title: "Archived card",
    archivedAt: new Date(),
  });
  return { team, user, collection, home, row };
}

describe("ExportTask", () => {
  it("exports the row pages of a database under their parent", async () => {
    const { team, user, collection } = await setup();
    const fileOperation = await buildFileOperation({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
    });

    const task = new ExportMarkdownZipTask();
    const fileNames = await listFiles(
      await task.loadDataAndExport(fileOperation, user)
    );

    expect(fileNames).toEqual([
      "Projets/Kanban.md",
      "Projets/Kanban/Card.md",
      "Projets/Kanban/Card/Detail.md",
      "Projets/Kanban/Notes.md",
    ]);
  });

  it("exports the rows of a collection database at the collection root", async () => {
    const team = await buildTeam();
    const user = await buildAdmin({ teamId: team.id });
    const collection = await buildCollection({
      teamId: team.id,
      userId: user.id,
      name: "Suivi",
    });
    await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      title: "Page",
    });
    const database = await buildDatabase({
      teamId: team.id,
      collectionId: collection.id,
    });
    await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      databaseId: database.id,
      databaseRecordId: "rec1",
      title: "Card",
    });
    const fileOperation = await buildFileOperation({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
    });

    const task = new ExportMarkdownZipTask();
    const fileNames = await listFiles(
      await task.loadDataAndExport(fileOperation, user)
    );

    expect(fileNames).toEqual(["Suivi/Card.md", "Suivi/Page.md"]);
  });

  it("exports a document with the row pages of its database", async () => {
    const { team, user, home } = await setup();
    const fileOperation = await buildFileOperation({
      teamId: team.id,
      userId: user.id,
      documentId: home.id,
    });

    const task = new ExportMarkdownZipTask();
    const fileNames = await listFiles(
      await task.loadDataAndExport(fileOperation, user)
    );

    expect(fileNames).toEqual([
      "Kanban.md",
      "Kanban/Card.md",
      "Kanban/Card/Detail.md",
      "Kanban/Notes.md",
    ]);
  });

  it("exports a row page with its sub-pages", async () => {
    const { team, user, row } = await setup();
    const fileOperation = await buildFileOperation({
      teamId: team.id,
      userId: user.id,
      documentId: row.id,
    });

    const task = new ExportMarkdownZipTask();
    const fileNames = await listFiles(
      await task.loadDataAndExport(fileOperation, user)
    );

    expect(fileNames).toEqual(["Card.md", "Card/Detail.md"]);
  });
});

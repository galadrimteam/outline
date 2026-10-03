import type { MockInstance } from "vitest";
import type { ProsemirrorData } from "@shared/types";
import { APIUpdateExtension } from "@server/collaboration/APIUpdateExtension";
import type { Collection, User } from "@server/models";
import { Database, Document } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { ProsemirrorHelper } from "@server/models/helpers/ProsemirrorHelper";
import {
  buildAdmin,
  buildCollection,
  buildDatabase,
  buildDocument,
} from "@server/test/factories";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { importedDatabaseTitlesFixer } from "./importedDatabaseTitlesFixer";

const past = new Date("2024-01-01T00:00:00.000Z");

const block = (
  databaseId: string,
  title: string,
  fullPage = false
): ProsemirrorData => ({
  type: "database",
  attrs: {
    id: `block-${databaseId}`,
    databaseId,
    viewIds: null,
    fullPage,
    hideTitle: true,
    legacyHref: null,
    title,
  },
});

const doc = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

const paragraph = (text: string): ProsemirrorData => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

describe("importedDatabaseTitlesFixer", () => {
  let admin: User;
  let collection: Collection;
  let describeTable: MockInstance<FakeEngine["describeTable"]>;

  beforeEach(async () => {
    vi.spyOn(APIUpdateExtension, "notifyUpdate").mockResolvedValue();
    const engine = new FakeEngine();
    describeTable = vi
      .spyOn(engine, "describeTable")
      .mockResolvedValue({ name: "Delisle Suivi Kanban (2)" });
    setEngineFactory(() => engine);
    admin = await buildAdmin();
    collection = await buildCollection({
      teamId: admin.teamId,
      userId: admin.id,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setEngineFactory();
  });

  async function showIn(
    title: string,
    databaseTitle: string,
    fullPage = false
  ) {
    const database = await buildDatabase({
      teamId: admin.teamId,
      collectionId: collection.id,
      title: databaseTitle,
    });
    const content = doc(
      paragraph("Lexique"),
      block(database.id, databaseTitle, fullPage)
    );
    const page = await buildDocument({
      teamId: admin.teamId,
      userId: admin.id,
      collectionId: collection.id,
      title,
      content,
      state: ProsemirrorHelper.toState(ProsemirrorHelper.toYDoc(content)),
      updatedAt: past,
    });
    return { database, page };
  }

  const blockTitle = async (documentId: string) => {
    const document = await Document.unscoped().findByPk(documentId, {
      rejectOnEmpty: true,
    });
    const json = await DocumentHelper.toJSON(document);
    return json.content?.find((node) => node.type === "database")?.attrs?.title;
  };

  it("gives a database named after the page showing it its table's Notion name", async () => {
    const { database, page } = await showIn(
      "Suivi du projet Outil ticketing",
      "Suivi du projet Outil ticketing"
    );

    const planned = await importedDatabaseTitlesFixer(admin, {
      collectionId: collection.id,
      dryRun: true,
    });
    expect(planned).toMatchObject({
      databases: 1,
      renamed: [
        {
          id: database.id,
          from: "Suivi du projet Outil ticketing",
          to: "Delisle Suivi Kanban",
        },
      ],
      rewritten: 0,
      failed: 0,
    });
    expect((await database.reload()).title).toBe(
      "Suivi du projet Outil ticketing"
    );

    const done = await importedDatabaseTitlesFixer(admin, {
      collectionId: collection.id,
    });
    expect(done).toMatchObject({ rewritten: 1, failed: 0 });
    expect((await database.reload()).title).toBe("Delisle Suivi Kanban");
    expect(await blockTitle(page.id)).toBe("Delisle Suivi Kanban");
    expect(
      (await Document.unscoped().findByPk(page.id))?.updatedAt.toISOString()
    ).toBe(past.toISOString());

    expect(
      await importedDatabaseTitlesFixer(admin, { collectionId: collection.id })
    ).toMatchObject({ renamed: [], rewritten: 0 });
  });

  it("leaves a database drawn as its page with the page's title", async () => {
    const { database } = await showIn(
      "Estimations (OLD)",
      "Estimations (OLD)",
      true
    );

    const result = await importedDatabaseTitlesFixer(admin, {
      collectionId: collection.id,
    });

    expect(result.renamed).toEqual([]);
    expect((await database.reload()).title).toBe("Estimations (OLD)");
    expect(describeTable).not.toHaveBeenCalled();
  });

  it("leaves a database whose name is not a page's", async () => {
    const { database } = await showIn(
      "Structure de BDD et Connexions",
      "BDD Classe"
    );

    const result = await importedDatabaseTitlesFixer(admin, {
      collectionId: collection.id,
    });

    expect(result.renamed).toEqual([]);
    expect((await database.reload()).title).toBe("BDD Classe");
  });

  it("counts a database whose table cannot be read and goes on", async () => {
    await showIn("Delisle", "Delisle");
    const { database } = await showIn(
      "Mission Grande Ecole",
      "Mission Grande Ecole"
    );
    describeTable
      .mockRejectedValueOnce(new Error("connection timeout"))
      .mockResolvedValue({ name: "Points" });

    const result = await importedDatabaseTitlesFixer(admin, {
      collectionId: collection.id,
    });

    expect(result).toMatchObject({ databases: 2, failed: 1 });
    expect(result.renamed).toEqual([
      { id: database.id, from: "Mission Grande Ecole", to: "Points" },
    ]);
  });

  it("only looks at the databases of the collection asked for", async () => {
    await showIn("Delisle", "Delisle");
    const other = await buildCollection({
      teamId: admin.teamId,
      userId: admin.id,
    });

    expect(
      await importedDatabaseTitlesFixer(admin, { collectionId: other.id })
    ).toMatchObject({ databases: 0, renamed: [] });
    expect(
      await Database.count({
        where: { title: "Delisle", teamId: admin.teamId },
      })
    ).toBe(1);
  });
});

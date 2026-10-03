import {
  CollectionPermission,
  DocumentPermission,
  UserRole,
} from "@shared/types";
import {
  Collection,
  Document,
  Event,
  GroupMembership,
  UserMembership,
} from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildGroup,
  buildTeam,
  buildTemplate,
  buildUser,
} from "@server/test/factories";
import { sequelize } from "@server/storage/database";
import { withAPIContext } from "@server/test/support";
import {
  databaseRowDocumentCreator,
  databaseRowsLinker,
} from "./databaseRowDocumentCreator";
import { databaseRowsTreeUpdater } from "./databaseRowsTreeUpdater";

async function setup() {
  const team = await buildTeam();
  const user = await buildUser({ teamId: team.id });
  const collection = await buildCollection({
    teamId: team.id,
    userId: user.id,
  });
  const home = await buildDocument({
    teamId: team.id,
    userId: user.id,
    collectionId: collection.id,
  });
  const database = await buildDatabase({
    teamId: team.id,
    documentId: home.id,
    collectionId: collection.id,
  });
  return { team, user, collection, home, database };
}

async function loadStructure(collectionId: string) {
  const collection = await Collection.findByPk(collectionId, {
    includeDocumentStructure: true,
    rejectOnEmpty: true,
  });
  return collection;
}

describe("databaseRowDocumentCreator", () => {
  it("creates a published child of the home document outside the tree", async () => {
    const { user, collection, home, database } = await setup();

    const document = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte", icon: "🚀" }
    );

    expect(document.databaseId).toEqual(database.id);
    expect(document.databaseRecordId).toEqual("rec1");
    expect(document.parentDocumentId).toEqual(home.id);
    expect(document.collectionId).toEqual(collection.id);
    expect(document.title).toEqual("Carte");
    expect(document.icon).toEqual("🚀");
    expect(document.createdById).toEqual(user.id);
    expect(document.publishedAt).toBeTruthy();

    const reloaded = await loadStructure(collection.id);
    expect(reloaded.getDocumentTree(document.id)).toBeNull();
    expect(reloaded.getDocumentTree(home.id)?.children).toEqual([]);

    const node = await home.toNavigationNode();
    expect(node.children).toEqual([]);

    expect(
      await Event.count({
        where: { documentId: document.id },
      })
    ).toEqual(0);
  });

  it("returns the existing page on later calls", async () => {
    const { user, database } = await setup();

    const first = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte" }
    );
    const second = await withAPIContext(user, (ctx) =>
      databaseRowDocumentCreator(ctx.context, {
        database,
        recordId: "rec1",
        title: "Autre titre",
      })
    );

    expect(second.id).toEqual(first.id);
    expect(second.title).toEqual("Carte");
  });

  it("creates a single page for concurrent calls", async () => {
    const { user, database } = await setup();

    const documents = await Promise.all([
      databaseRowDocumentCreator(
        { user },
        { database, recordId: "rec1", title: "Carte" }
      ),
      databaseRowDocumentCreator(
        { user },
        { database, recordId: "rec1", title: "Carte" }
      ),
      withAPIContext(user, (ctx) =>
        databaseRowDocumentCreator(ctx.context, {
          database,
          recordId: "rec1",
          title: "Carte",
        })
      ),
    ]);

    expect(new Set(documents.map((document) => document.id)).size).toEqual(1);
    expect(
      await Document.unscoped().count({
        where: { databaseId: database.id, databaseRecordId: "rec1" },
      })
    ).toEqual(1);
  });

  it("lets a reader open a row", async () => {
    const team = await buildTeam();
    const reader = await buildUser({ teamId: team.id, role: UserRole.Viewer });
    const collection = await buildCollection({
      teamId: team.id,
      permission: CollectionPermission.Read,
    });
    const home = await buildDocument({
      teamId: team.id,
      collectionId: collection.id,
    });
    const database = await buildDatabase({
      teamId: team.id,
      documentId: home.id,
    });

    const document = await databaseRowDocumentCreator(
      { user: reader },
      { database, recordId: "rec1", title: "Carte" }
    );
    expect(document.createdById).toEqual(reader.id);
    expect(document.parentDocumentId).toEqual(home.id);
  });

  it("copies the memberships of the home document", async () => {
    const { team, user, home, database } = await setup();
    const member = await buildUser({ teamId: team.id });
    const group = await buildGroup({ teamId: team.id });
    const userMembership = await UserMembership.create({
      documentId: home.id,
      userId: member.id,
      createdById: user.id,
      permission: DocumentPermission.ReadWrite,
    });
    const groupMembership = await GroupMembership.create({
      documentId: home.id,
      groupId: group.id,
      createdById: user.id,
      permission: DocumentPermission.Read,
    });

    const document = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte" }
    );

    const copiedUser = await UserMembership.findOne({
      where: { documentId: document.id, userId: member.id },
    });
    expect(copiedUser?.permission).toEqual(DocumentPermission.ReadWrite);
    expect(copiedUser?.sourceId).toEqual(userMembership.id);

    const copiedGroup = await GroupMembership.findOne({
      where: { documentId: document.id, groupId: group.id },
    });
    expect(copiedGroup?.permission).toEqual(DocumentPermission.Read);
    expect(copiedGroup?.sourceId).toEqual(groupMembership.id);
  });

  it("puts the rows of a collection database at the collection root, outside the tree", async () => {
    const team = await buildTeam();
    const user = await buildUser({ teamId: team.id });
    const collection = await buildCollection({ teamId: team.id });
    const database = await buildDatabase({
      teamId: team.id,
      collectionId: collection.id,
    });

    const document = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte" }
    );

    expect(document.parentDocumentId).toBeNull();
    expect(document.collectionId).toEqual(collection.id);
    const reloaded = await loadStructure(collection.id);
    expect(reloaded.documentStructure ?? []).toEqual([]);
  });

  it("keeps a renamed row page out of the tree", async () => {
    const { user, collection, database } = await setup();
    const document = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte" }
    );
    const before = (await loadStructure(collection.id)).documentStructure;

    document.title = "Nouveau titre";
    await document.save();

    expect((await loadStructure(collection.id)).documentStructure).toEqual(
      before
    );
  });

  it("starts a new page from a template, variables replaced", async () => {
    const { user, collection, database } = await setup();
    const template = await buildTemplate({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
      text: "Rédigé par {author}",
      icon: "📋",
      fullWidth: true,
    });

    const document = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte", template }
    );

    expect(document.title).toEqual("Carte");
    expect(document.templateId).toEqual(template.id);
    expect(document.icon).toEqual("📋");
    expect(document.fullWidth).toBe(true);
    expect(document.text).toContain(`Rédigé par ${user.name}`);
    expect(JSON.stringify(template.content)).toContain("{author}");
  });

  it("keeps an existing page when given a template", async () => {
    const { user, database } = await setup();
    const first = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte" }
    );
    const template = await buildTemplate({
      teamId: user.teamId,
      userId: user.id,
      text: "Corps du modèle",
    });

    const second = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte", template }
    );

    expect(second.id).toEqual(first.id);
    expect(second.text).not.toContain("Corps du modèle");
  });

  it("fails when the home document is deleted", async () => {
    const { user, home, database } = await setup();
    await withAPIContext(user, (ctx) => home.destroyWithCtx(ctx));

    await expect(
      databaseRowDocumentCreator(
        { user },
        { database, recordId: "rec1", title: "Carte" }
      )
    ).rejects.toThrow();
  });
});

describe("databaseRowsLinker", () => {
  it("links documents to rows and takes them out of the tree", async () => {
    const { team, user, collection, home, database } = await setup();
    const first = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: home.id,
    });
    const second = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: home.id,
    });
    const other = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: home.id,
    });
    let structure = await loadStructure(collection.id);
    expect(structure.getDocumentTree(home.id)?.children.length).toEqual(3);

    const linked = await withAPIContext(user, (ctx) =>
      databaseRowsLinker(ctx.context, {
        database,
        pairs: [
          { recordId: "rec1", documentId: first.id },
          { recordId: "rec2", documentId: second.id },
        ],
      })
    );

    expect(linked).toEqual(2);
    await first.reload();
    await second.reload();
    expect(first.databaseId).toEqual(database.id);
    expect(first.databaseRecordId).toEqual("rec1");
    expect(second.databaseRecordId).toEqual("rec2");

    structure = await loadStructure(collection.id);
    expect(structure.getDocumentTree(first.id)).toBeNull();
    expect(structure.getDocumentTree(second.id)).toBeNull();
    expect(
      structure.getDocumentTree(home.id)?.children.map((node) => node.id)
    ).toEqual([other.id]);

    const opened = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte" }
    );
    expect(opened.id).toEqual(first.id);
  });

  it("skips documents it must not link", async () => {
    const { team, user, collection, home, database } = await setup();
    const elsewhere = await buildDocument({ teamId: team.id, userId: user.id });
    const [page, duplicate, free] = await Promise.all(
      [1, 2, 3].map(() =>
        buildDocument({
          teamId: team.id,
          userId: user.id,
          collectionId: collection.id,
        })
      )
    );
    const taken = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Carte" }
    );

    const linked = await databaseRowsLinker(
      { user },
      {
        database,
        pairs: [
          { recordId: "rec1", documentId: page.id },
          { recordId: "rec2", documentId: elsewhere.id },
          { recordId: "rec3", documentId: home.id },
          { recordId: "rec4", documentId: free.id },
          { recordId: "rec4", documentId: duplicate.id },
        ],
      }
    );

    expect(linked).toEqual(1);
    await Promise.all(
      [page, elsewhere, home, free, duplicate, taken].map((document) =>
        document.reload()
      )
    );
    expect(free.databaseRecordId).toEqual("rec4");
    expect(page.databaseId).toBeNull();
    expect(elsewhere.databaseId).toBeNull();
    expect(home.databaseId).toBeNull();
    expect(duplicate.databaseId).toBeNull();
    expect(taken.databaseRecordId).toEqual("rec1");
  });
});

describe("a database that keeps its rows in the sidebar", () => {
  async function projects() {
    const context = await setup();
    await context.database.update({ settings: { rowsInSidebar: true } });
    return context;
  }

  it("creates the page of a row in the tree, under the home document", async () => {
    const { user, collection, home, database } = await projects();

    const document = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Delisle" }
    );

    const structure = await loadStructure(collection.id);
    expect(
      structure.getDocumentTree(home.id)?.children.map((node) => node.id)
    ).toEqual([document.id]);
    expect((await home.toNavigationNode()).children).toEqual([
      expect.objectContaining({ id: document.id }),
    ]);
  });

  it("renames a row page in the tree", async () => {
    const { user, collection, database } = await projects();
    const document = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Delisle" }
    );

    document.title = "Delisle 2";
    await document.save();

    const structure = await loadStructure(collection.id);
    expect(structure.getDocumentTree(document.id)?.title).toEqual("Delisle 2");
  });

  it("links documents without taking them, or their sub-pages, out of the tree", async () => {
    const { team, user, collection, home, database } = await projects();
    const project = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: home.id,
    });
    const subPage = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: project.id,
    });

    const linked = await withAPIContext(user, (ctx) =>
      databaseRowsLinker(ctx.context, {
        database,
        pairs: [{ recordId: "rec1", documentId: project.id }],
      })
    );

    expect(linked).toEqual(1);
    const structure = await loadStructure(collection.id);
    expect(
      structure.getDocumentTree(project.id)?.children.map((node) => node.id)
    ).toEqual([subPage.id]);
  });
});

describe("databaseRowsTreeUpdater", () => {
  it("puts the row pages and their sub-pages in the tree, then takes them out", async () => {
    const { team, user, collection, home, database } = await setup();
    const card = await databaseRowDocumentCreator(
      { user },
      { database, recordId: "rec1", title: "Delisle" }
    );
    const subPage = await buildDocument({
      teamId: team.id,
      userId: user.id,
      collectionId: collection.id,
      parentDocumentId: card.id,
    });
    expect((await loadStructure(collection.id)).getDocumentTree(card.id)).toBe(
      null
    );

    await database.update({ settings: { rowsInSidebar: true } });
    const added = await sequelize.transaction((transaction) =>
      databaseRowsTreeUpdater(database, { transaction })
    );

    expect(added).toEqual(1);
    let structure = await loadStructure(collection.id);
    expect(structure.getDocumentTree(home.id)?.children).toEqual([
      expect.objectContaining({
        id: card.id,
        children: [expect.objectContaining({ id: subPage.id })],
      }),
    ]);

    await database.update({ settings: {} });
    const removed = await sequelize.transaction((transaction) =>
      databaseRowsTreeUpdater(database, { transaction })
    );

    expect(removed).toEqual(1);
    structure = await loadStructure(collection.id);
    expect(structure.getDocumentTree(home.id)?.children).toEqual([]);
    expect(structure.getDocumentTree(subPage.id)).toBeNull();
  });
});

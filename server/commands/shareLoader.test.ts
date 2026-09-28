import { faker } from "@faker-js/faker";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildShare,
  buildTeam,
  buildUser,
} from "@server/test/factories";
import { loadPublicShare, loadShareWithParent } from "./shareLoader";

describe("shareLoader", () => {
  describe("collection share", () => {
    it("should return share with tree and collection when requested with id", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const childDocument = await buildDocument({
        parentDocumentId: document.id,
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
      });

      const result = await loadPublicShare({
        id: share.id,
      });

      expect(result.share.id).toEqual(share.id);
      expect(result.collection?.id).toEqual(collection.id);
      expect(result.sharedTree?.id).toEqual(collection.id);
      expect(result.sharedTree?.url).toEqual(collection.path);
      expect(result.sharedTree?.children[0].id).toEqual(document.id);
      expect(result.sharedTree?.children[0].children[0].id).toEqual(
        childDocument.id
      );
      expect(result.document).toBeNull();
    });

    it("should return correct path for root node in sharedTree for domain", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      await buildDocument({
        parentDocumentId: document.id,
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
        domain: faker.internet.domainName(),
      });

      const result = await loadPublicShare({
        id: share.id,
      });

      expect(result.share.id).toEqual(share.id);
      expect(result.collection?.id).toEqual(collection.id);
      expect(result.sharedTree?.id).toEqual(collection.id);
      expect(result.sharedTree?.url).toEqual("");
    });

    it("should return only share when requested with collectionId", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
      });

      const result = await loadShareWithParent({
        collectionId: collection.id,
        user,
      });

      expect(result.share.id).toEqual(share.id);
      expect(result.parentShare).toBeNull();
    });

    it("should throw error when the requested collection is not part of the share", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const anotherCollection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
      });

      await expect(
        loadPublicShare({ id: share.id, collectionId: anotherCollection.id })
      ).rejects.toThrow();
    });
  });

  describe("document share", () => {
    it("should return share with tree and document when requested with id", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const childDocument = await buildDocument({
        parentDocumentId: document.id,
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        includeChildDocuments: true,
        userId: user.id,
        teamId: user.teamId,
        documentId: document.id,
      });

      const result = await loadPublicShare({
        id: share.id,
      });

      expect(result.share.id).toEqual(share.id);
      expect(result.document?.id).toEqual(document.id);
      expect(result.sharedTree?.id).toEqual(document.id);
      expect(result.sharedTree?.children.length).toEqual(1);
      expect(result.sharedTree?.children[0].id).toEqual(childDocument.id);
      expect(result.collection).toBeNull();
    });

    it("should not return share tree when includeChildDocuments is false", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      await buildDocument({
        parentDocumentId: document.id,
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        includeChildDocuments: false,
        userId: user.id,
        teamId: user.teamId,
        documentId: document.id,
      });

      const result = await loadPublicShare({
        id: share.id,
      });

      expect(result.share.id).toEqual(share.id);
      expect(result.document?.id).toEqual(document.id);
      expect(result.sharedTree).toBeNull();
      expect(result.collection).toBeNull();
    });

    it("should return share and parentShare when requested with documentId", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const childDocument = await buildDocument({
        parentDocumentId: document.id,
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const [parentShare, share] = await Promise.all([
        buildShare({
          includeChildDocuments: true,
          userId: user.id,
          teamId: user.teamId,
          documentId: document.id,
        }),
        buildShare({
          includeChildDocuments: false,
          userId: user.id,
          teamId: user.teamId,
          documentId: childDocument.id,
        }),
      ]);

      const result = await loadShareWithParent({
        documentId: childDocument.id,
        user,
      });

      expect(result.share.id).toEqual(share.id);
      expect(result.parentShare?.id).toEqual(parentShare.id);
    });

    it("should throw error when the requested document is not part of the share (includeChildDocuments = true)", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const anotherDocument = await buildDocument({
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        includeChildDocuments: true,
        userId: user.id,
        teamId: user.teamId,
        documentId: document.id,
      });

      await expect(
        loadPublicShare({ id: share.id, documentId: anotherDocument.id })
      ).rejects.toThrow();
    });

    it("should throw error when the requested document is not part of the share (includeChildDocuments = false)", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const anotherDocument = await buildDocument({
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        includeChildDocuments: false,
        userId: user.id,
        teamId: user.teamId,
        documentId: document.id,
      });

      await expect(
        loadPublicShare({ id: share.id, documentId: anotherDocument.id })
      ).rejects.toThrow();
    });

    it("should throw error when the child document is requested for a share with includeChildDocuments = false", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const document = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const childDocument = await buildDocument({
        parentDocumentId: document.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        includeChildDocuments: false,
        userId: user.id,
        teamId: user.teamId,
        documentId: document.id,
      });

      await expect(
        loadPublicShare({ id: share.id, documentId: childDocument.id })
      ).rejects.toThrow();
    });
  });

  describe("inactive share when requested with id", () => {
    it("should throw error when share is not published", async () => {
      const share = await buildShare({
        published: false,
      });

      await expect(loadPublicShare({ id: share.id })).rejects.toThrow();
    });

    it("should throw error when team has disabled sharing", async () => {
      const team = await buildTeam({
        sharing: false,
      });
      const share = await buildShare({
        teamId: team.id,
      });

      await expect(loadPublicShare({ id: share.id })).rejects.toThrow();
    });

    it("should throw error when team is suspended", async () => {
      const team = await buildTeam({
        suspendedAt: new Date(),
      });
      const share = await buildShare({
        teamId: team.id,
      });

      await expect(loadPublicShare({ id: share.id })).rejects.toThrow();
    });

    it("should throw error when collection has disabled sharing", async () => {
      const collection = await buildCollection({
        sharing: false,
      });
      const share = await buildShare({
        collectionId: collection.id,
        teamId: collection.teamId,
      });

      await expect(loadPublicShare({ id: share.id })).rejects.toThrow();
    });

    it("should throw error when collection is archived", async () => {
      const collection = await buildCollection({
        archivedAt: new Date(),
      });
      const share = await buildShare({
        collectionId: collection.id,
        teamId: collection.teamId,
      });

      await expect(loadPublicShare({ id: share.id })).rejects.toThrow();
    });

    it("should throw error when document is archived", async () => {
      const document = await buildDocument({
        archivedAt: new Date(),
      });
      const share = await buildShare({
        documentId: document.id,
        teamId: document.teamId,
      });

      await expect(loadPublicShare({ id: share.id })).rejects.toThrow();
    });
  });

  describe("database row pages", () => {
    async function buildRowPageUnder(
      parent: Awaited<ReturnType<typeof buildDocument>>,
      recordId = "rec1"
    ) {
      const database = await buildDatabase({
        teamId: parent.teamId,
        documentId: parent.id,
      });
      return buildDocument({
        teamId: parent.teamId,
        collectionId: parent.collectionId,
        parentDocumentId: parent.id,
        databaseId: database.id,
        databaseRecordId: recordId,
      });
    }

    async function buildSharedTree(includeChildDocuments: boolean) {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const shared = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const child = await buildDocument({
        parentDocumentId: shared.id,
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const share = await buildShare({
        includeChildDocuments,
        userId: user.id,
        teamId: user.teamId,
        documentId: shared.id,
      });
      return { user, collection, shared, child, share };
    }

    it("should load a row page of a database under the shared document", async () => {
      const { shared, child, share } = await buildSharedTree(true);
      const directRow = await buildRowPageUnder(shared, "rec1");
      const nestedRow = await buildRowPageUnder(child, "rec2");

      const direct = await loadPublicShare({
        id: share.id,
        documentId: directRow.id,
      });
      expect(direct.document?.id).toEqual(directRow.id);
      expect(direct.sharedTree?.children.map((node) => node.id)).toEqual([
        child.id,
      ]);

      const nested = await loadPublicShare({
        id: share.id,
        documentId: nestedRow.id,
      });
      expect(nested.document?.id).toEqual(nestedRow.id);
    });

    it("should load the row page of a database held by a row page", async () => {
      const { shared, share } = await buildSharedTree(true);
      const row = await buildRowPageUnder(shared, "rec1");
      const rowOfRow = await buildRowPageUnder(row, "rec2");

      const result = await loadPublicShare({
        id: share.id,
        documentId: rowOfRow.id,
      });
      expect(result.document?.id).toEqual(rowOfRow.id);
    });

    it("should not load a row page when the share excludes child documents", async () => {
      const { shared, share } = await buildSharedTree(false);
      const row = await buildRowPageUnder(shared);

      await expect(
        loadPublicShare({ id: share.id, documentId: row.id })
      ).rejects.toThrow();
    });

    it("should not load a row page of a database outside the share", async () => {
      const { user, collection, share } = await buildSharedTree(true);
      const outside = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
      });
      const row = await buildRowPageUnder(outside);

      await expect(
        loadPublicShare({ id: share.id, documentId: row.id })
      ).rejects.toThrow();
    });

    it("should load a row page through a collection share", async () => {
      const user = await buildUser();
      const collection = await buildCollection({
        userId: user.id,
        teamId: user.teamId,
      });
      const database = await buildDatabase({
        teamId: user.teamId,
        collectionId: collection.id,
      });
      const row = await buildDocument({
        collectionId: collection.id,
        userId: user.id,
        teamId: user.teamId,
        databaseId: database.id,
        databaseRecordId: "rec1",
      });
      const share = await buildShare({
        userId: user.id,
        teamId: user.teamId,
        collectionId: collection.id,
        includeChildDocuments: true,
      });

      const result = await loadPublicShare({
        id: share.id,
        documentId: row.id,
      });
      expect(result.document?.id).toEqual(row.id);
    });

    it("should return the share of the parent chain as parentShare", async () => {
      const { user, shared, child, share } = await buildSharedTree(true);
      const row = await buildRowPageUnder(child);
      const rowShare = await buildShare({
        includeChildDocuments: false,
        userId: user.id,
        teamId: user.teamId,
        documentId: row.id,
      });

      const result = await loadShareWithParent({
        documentId: row.id,
        user,
      });

      expect(result.share.id).toEqual(rowShare.id);
      expect(result.parentShare?.id).toEqual(share.id);
      expect(shared.id).toEqual(share.documentId);
    });
  });
});

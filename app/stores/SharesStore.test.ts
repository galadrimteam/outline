import stores from "~/stores";

const collectionId = "c0000000-0000-4000-8000-000000000001";
const projectId = "d0000000-0000-4000-8000-000000000001";
const cardId = "d0000000-0000-4000-8000-000000000002";
const subCardId = "d0000000-0000-4000-8000-000000000003";
const otherId = "d0000000-0000-4000-8000-000000000004";

function node(id: string, title: string) {
  return { id, title, url: `/doc/${id}`, children: [] };
}

describe("SharesStore", () => {
  describe("getByDocumentParents", () => {
    beforeEach(() => {
      stores.shares.clear();
      stores.collections.add({
        id: collectionId,
        name: "Projets",
        documents: [node(projectId, "Projet"), node(otherId, "Autre")],
      });
      stores.documents.add({
        id: projectId,
        title: "Projet",
        collectionId,
      });
      stores.documents.add({
        id: cardId,
        title: "Carte",
        collectionId,
        parentDocumentId: projectId,
        databaseId: "b0000000-0000-4000-8000-000000000001",
        databaseRecordId: "rec1",
      });
      stores.documents.add({
        id: subCardId,
        title: "Sous-carte",
        collectionId,
        parentDocumentId: cardId,
        databaseId: "b0000000-0000-4000-8000-000000000002",
        databaseRecordId: "rec2",
      });
    });

    it("finds the share of the page a row page's database lives in", () => {
      const share = stores.shares.add({
        id: "s0000000-0000-4000-8000-000000000001",
        documentId: projectId,
        published: true,
        includeChildDocuments: true,
      });

      expect(
        stores.shares.getByDocumentParents(stores.documents.get(cardId)!)
      ).toBe(share);
      expect(
        stores.shares.getByDocumentParents(stores.documents.get(subCardId)!)
      ).toBe(share);
    });

    it("finds the share of a row page that has rows of its own", () => {
      const share = stores.shares.add({
        id: "s0000000-0000-4000-8000-000000000002",
        documentId: cardId,
        published: true,
        includeChildDocuments: true,
      });

      expect(
        stores.shares.getByDocumentParents(stores.documents.get(subCardId)!)
      ).toBe(share);
    });

    it("ignores the shares of other pages", () => {
      stores.shares.add({
        id: "s0000000-0000-4000-8000-000000000003",
        documentId: otherId,
        published: true,
        includeChildDocuments: true,
      });

      expect(
        stores.shares.getByDocumentParents(stores.documents.get(cardId)!)
      ).toBeUndefined();
    });
  });
});

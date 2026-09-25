import { Database, Document } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import type { DocumentMovedEvent } from "@server/types";
import { DatabaseAnchorMoveProcessor } from "./DatabaseAnchorMoveProcessor";

function moved(
  document: Document,
  documentIds: string[],
  actorId: string
): DocumentMovedEvent {
  return {
    name: "documents.move",
    documentId: document.id,
    collectionId: document.collectionId ?? "",
    teamId: document.teamId,
    actorId,
    ip: null,
    data: { collectionIds: [], documentIds },
  };
}

describe("DatabaseAnchorMoveProcessor", () => {
  it("follows the home document of a database into its new collection", async () => {
    const user = await buildUser();
    const source = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const target = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const parent = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: source.id,
    });
    const child = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: source.id,
      parentDocumentId: parent.id,
    });
    const anchored = await buildDatabase({
      teamId: user.teamId,
      documentId: child.id,
    });
    const elsewhere = await buildDatabase({
      teamId: user.teamId,
      collectionId: source.id,
    });

    // What documentMover leaves behind: the tree is in the new collection.
    await Document.update(
      { collectionId: target.id },
      { where: { id: [parent.id, child.id] } }
    );
    const event = moved(
      await Document.findByPk(parent.id, { rejectOnEmpty: true }),
      [child.id, parent.id],
      user.id
    );

    expect(await DatabaseAnchorMoveProcessor.shouldQueue(event)).toBe(true);
    await new DatabaseAnchorMoveProcessor().perform(event);

    expect((await Database.findByPk(anchored.id))?.collectionId).toEqual(
      target.id
    );
    expect((await Database.findByPk(elsewhere.id))?.collectionId).toEqual(
      source.id
    );
  });

  it("skips moves without any database", async () => {
    const document = await buildDocument();

    expect(
      await DatabaseAnchorMoveProcessor.shouldQueue(
        moved(document, [document.id], document.createdById)
      )
    ).toBe(false);
  });
});

import { Op } from "sequelize";
import { Database, Document } from "@server/models";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { DocumentMovedEvent, Event } from "@server/types";

/**
 * Keeps `databases.collectionId` right when the home document of a database,
 * or one of its ancestors, moves to another collection: moving a document
 * updates its descendants' collection but knows nothing of databases.
 */
export class DatabaseAnchorMoveProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = ["documents.move"];

  /**
   * Only queues moves that carried a database's home document.
   *
   * @param event the event about to be queued.
   * @returns true when a moved document anchors a database.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    if (event.name !== "documents.move") {
      return false;
    }
    const count = await Database.count({
      where: { documentId: event.data.documentIds },
    });
    return count > 0;
  }

  async perform(event: DocumentMovedEvent) {
    const document = await Document.unscoped().findByPk(event.documentId, {
      attributes: ["id", "collectionId", "teamId"],
    });
    if (!document?.collectionId) {
      return;
    }
    const childDocumentIds = await document.findAllChildDocumentIds();
    await Database.update(
      { collectionId: document.collectionId },
      {
        where: {
          teamId: document.teamId,
          documentId: [document.id, ...childDocumentIds],
          collectionId: { [Op.ne]: document.collectionId },
        },
      }
    );
  }
}

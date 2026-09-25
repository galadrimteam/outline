import { DatabaseFieldType } from "@shared/databases/types";
import { toError } from "@shared/utils/error";
import Logger from "@server/logging/Logger";
import { Database, Document, User } from "@server/models";
import { cannot } from "@server/policies";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { DocumentEvent, Event } from "@server/types";
import { engineFor, refFor } from "../engine";
import { actorFor } from "../utils/actor";
import { cellText } from "../utils/cellText";

/** Primary field types a page title can be written into. */
const writableTitleTypes = [
  DatabaseFieldType.SingleLineText,
  DatabaseFieldType.LongText,
];

/**
 * Copies the title of a row's page into the row's primary field, as the person
 * who renamed the page. The write is tagged "outline" so that the engine's
 * change notification does not rename the page again.
 */
export class DatabaseRowTitleProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = ["documents.title_change"];

  /**
   * Only queues title changes of row pages.
   *
   * @param event the event about to be queued.
   * @returns true when the document is the page of a database row.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    if (event.name !== "documents.title_change" || !event.actorId) {
      return false;
    }
    const document = await Document.unscoped().findByPk(event.documentId, {
      attributes: ["id", "databaseId", "databaseRecordId"],
    });
    return !!document?.databaseId && !!document.databaseRecordId;
  }

  async perform(event: DocumentEvent) {
    if (event.name !== "documents.title_change" || !event.actorId) {
      return;
    }
    const document = await Document.unscoped().findByPk(event.documentId, {
      attributes: ["id", "title", "databaseId", "databaseRecordId"],
    });
    const recordId = document?.databaseRecordId;
    if (!document?.databaseId || !recordId) {
      return;
    }
    const user = await User.findByPk(event.actorId);
    if (!user) {
      return;
    }
    const database = await Database.findByPkForUser(
      document.databaseId,
      user.id
    );
    if (!database || cannot(user, "update", database)) {
      return;
    }

    const engine = engineFor(database, { origin: "outline" });
    const actor = actorFor(user);
    const ref = refFor(database);
    try {
      const [schema, record] = await Promise.all([
        engine.getSchema(actor, ref),
        engine.getRecord(actor, ref, recordId),
      ]);
      const primary = schema.fields.find((field) => field.isPrimary);
      if (
        !primary ||
        primary.isComputed ||
        !writableTitleTypes.includes(primary.type)
      ) {
        return;
      }
      if (cellText(record.fields[primary.id]) === document.title) {
        return;
      }
      await engine.updateRecord(actor, ref, recordId, {
        fields: { [primary.id]: document.title },
      });
    } catch (err) {
      if (isGone(err)) {
        Logger.info("processor", "Row of a renamed page is gone", {
          documentId: document.id,
          databaseId: database.id,
        });
        return;
      }
      throw toError(err);
    }
  }
}

function isGone(err: unknown) {
  return (
    err instanceof Error &&
    "status" in err &&
    (err.status === 403 || err.status === 404)
  );
}

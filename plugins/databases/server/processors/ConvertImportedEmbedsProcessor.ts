import { Document } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { DocumentEvent, Event } from "@server/types";
import { ConvertTeableEmbedsTask } from "../tasks/ConvertTeableEmbedsTask";
import { findTeableEmbeds } from "../utils/teableEmbeds";

/**
 * Converts the Teable embeds of imported documents into database nodes. The
 * migration keeps importing pages whose databases are Teable embeds, and the
 * Markdown parser cannot resolve them since it has no access to the database.
 */
export class ConvertImportedEmbedsProcessor extends BaseProcessor {
  // Collection imports only send documents.create; single document imports
  // also send documents.publish. Converting twice changes nothing.
  static applicableEvents: Event["name"][] = [
    "documents.create",
    "documents.publish",
  ];

  /**
   * Only queues the events of imported documents.
   *
   * @param event the event about to be queued.
   * @returns true when the event comes from an import.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    return isImportEvent(event);
  }

  public async perform(event: Event) {
    if (!isImportEvent(event)) {
      return;
    }

    const document = await Document.unscoped().findOne({
      where: { id: event.documentId },
    });
    if (!document?.publishedAt) {
      return;
    }

    const content = await DocumentHelper.toJSON(document);
    if (!findTeableEmbeds(content).length) {
      return;
    }

    await new ConvertTeableEmbedsTask().schedule({
      teamId: document.teamId,
      documentId: document.id,
      actorId: event.actorId,
      dryRun: false,
    });
  }
}

function isImportEvent(event: Event): event is DocumentEvent & {
  name: "documents.create" | "documents.publish";
  documentId: string;
} {
  return (
    (event.name === "documents.create" || event.name === "documents.publish") &&
    event.data?.source === "import"
  );
}

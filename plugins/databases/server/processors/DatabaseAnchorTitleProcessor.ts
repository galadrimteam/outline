import { Database, Document } from "@server/models";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { DocumentEvent, Event } from "@server/types";

/**
 * A full-page database has no title of its own, as in Notion: it is its page's.
 * When that page is renamed, the database follows, so that pickers, links and
 * the MCP tools show the name people see.
 */
export class DatabaseAnchorTitleProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = ["documents.title_change"];

  /**
   * Only queues renames of a database's home document.
   *
   * @param event the event about to be queued.
   * @returns true when the renamed document anchors a database.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    if (event.name !== "documents.title_change") {
      return false;
    }
    const count = await Database.count({
      where: { documentId: event.documentId },
    });
    return count > 0;
  }

  async perform(event: DocumentEvent) {
    const document = await Document.unscoped().findByPk(event.documentId, {
      attributes: ["id", "title", "content"],
    });
    if (!document) {
      return;
    }
    const fullPageIds = fullPageDatabaseIds(document.content);
    if (fullPageIds.length === 0) {
      return;
    }
    await Database.update(
      { title: document.title.slice(0, 255) },
      { where: { id: fullPageIds, documentId: document.id } }
    );
  }
}

interface ContentNode {
  type?: string;
  attrs?: { databaseId?: unknown; fullPage?: unknown } | null;
  content?: ContentNode[];
}

function fullPageDatabaseIds(content: ContentNode | null): string[] {
  const ids: string[] = [];
  const visit = (node: ContentNode) => {
    if (
      node.type === "database" &&
      node.attrs?.fullPage === true &&
      typeof node.attrs.databaseId === "string"
    ) {
      ids.push(node.attrs.databaseId);
    }
    node.content?.forEach(visit);
  };
  if (content) {
    visit(content);
  }
  return ids;
}

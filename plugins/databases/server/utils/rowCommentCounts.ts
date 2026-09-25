import { Comment, Document } from "@server/models";
import type { Database } from "@server/models";

/**
 * Counts the open comments on the pages of database rows, threads and their
 * replies, as a document's comment count does: resolved threads are left out.
 * Two queries whatever the number of rows.
 *
 * @param database the database the rows belong to.
 * @param recordIds the rows.
 * @returns the count of every given row, 0 for rows without a page.
 */
export async function rowCommentCounts(
  database: Pick<Database, "id">,
  recordIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(
    recordIds.map((recordId) => [recordId, 0])
  );
  const pages = await Document.unscoped().findAll({
    attributes: ["id", "databaseRecordId"],
    where: { databaseId: database.id, databaseRecordId: recordIds },
  });
  if (!pages.length) {
    return counts;
  }

  const rows = await Comment.unscoped().count({
    where: { documentId: pages.map((page) => page.id), resolvedAt: null },
    group: ["documentId"],
  });
  const countByDocumentId = new Map(
    rows.map((row) => [String(row.documentId), row.count])
  );
  for (const page of pages) {
    if (page.databaseRecordId) {
      counts[page.databaseRecordId] = countByDocumentId.get(page.id) ?? 0;
    }
  }
  return counts;
}

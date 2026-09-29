import { Op } from "sequelize";
import type { Transaction } from "sequelize";
import { createContext } from "@server/context";
import { Document } from "@server/models";
import type { Database, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";

interface Props {
  /** The user the pages are copied for and by. */
  user: User;
  /** The database whose rows were copied. */
  source: Database;
  /** The copy of the database, holding the copied rows. */
  database: Database;
  /**
   * Engine id of each copied row, keyed by the id of its source row; absent
   * when each copied row kept the id of its source.
   */
  recordIds?: Record<string, string>;
  /** The transaction the copy was created in. */
  transaction?: Transaction | null;
}

/**
 * Gives the copied rows of a database a copy of the page of their source row
 * (title, icon, body without its comments), as Notion duplicates a row with
 * its content. Each copied page is the page of the copied row, under the home
 * document of the copy, out of the collection's tree like every row page.
 * Rows without a page get none, and a page whose row was not copied is left
 * out. Publishing the copies sends no event, as when a row's page is created.
 *
 * @param props the user, the database, its copy and the ids of the copied rows.
 * @returns the copied pages.
 */
export async function databaseRowPagesDuplicator({
  user,
  source,
  database,
  recordIds,
  transaction,
}: Props): Promise<Document[]> {
  const pages = await Document.unscoped().findAll({
    where: {
      databaseId: source.id,
      databaseRecordId: { [Op.ne]: null },
    },
    order: [["createdAt", "ASC"]],
    transaction,
  });

  const ctx = createContext({ user, transaction: transaction ?? undefined });
  const copies: Document[] = [];
  for (const page of pages) {
    const recordId = copiedRecordId(page.databaseRecordId, recordIds);
    if (!recordId) {
      continue;
    }
    const copy = Document.build({
      databaseId: database.id,
      databaseRecordId: recordId,
      parentDocumentId: database.documentId,
      collectionId: database.collectionId,
      teamId: database.teamId,
      title: page.title,
      icon: page.icon,
      color: page.color,
      fullWidth: page.fullWidth,
      preferences: page.preferences,
      content: await DocumentHelper.toJSON(page, { removeMarks: ["comment"] }),
      sourceMetadata: { ...page.sourceMetadata, originalDocumentId: page.id },
      createdById: user.id,
      lastModifiedById: user.id,
    });
    copy.text = await DocumentHelper.toMarkdown(copy, { includeTitle: false });
    await copy.save({ transaction });
    await copy.publish(ctx, {
      collectionId: database.collectionId,
      event: false,
    });
    copies.push(copy);
  }
  return copies;
}

function copiedRecordId(
  recordId: string | null,
  recordIds: Record<string, string> | undefined
): string | undefined {
  if (!recordId) {
    return undefined;
  }
  return recordIds ? recordIds[recordId] : recordId;
}

import { Node } from "prosemirror-model";
import type { Transaction } from "sequelize";
import type { ProsemirrorData } from "@shared/types";
import { toError } from "@shared/utils/error";
import { schema } from "@server/editor";
import Logger from "@server/logging/Logger";
import { Database } from "@server/models";
import type { Document, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { can } from "@server/policies";
import type { DatabaseNodeCopy } from "../utils/databaseNodes";
import { databaseIdsIn, rewriteDatabaseNodes } from "../utils/databaseNodes";
import type { DatabaseDuplication } from "./databasesDuplicator";
import { databasesDuplicator } from "./databasesDuplicator";

interface Props {
  /** The user who duplicated the documents. */
  user: User;
  /**
   * Documents just created from others, with their content loaded: copies
   * (`sourceMetadata.originalDocumentId`) or documents made from a template
   * (`templateId`), duplicated together. They are updated in place.
   */
  documents: Document[];
  /** Whether the rows of the databases are copied too, with their pages. */
  withRecords?: boolean;
  /** The transaction the documents were created in. */
  transaction?: Transaction | null;
}

/**
 * Gives new documents their own copy of the databases of the documents they
 * were made from, as Notion does when a page is duplicated: every database
 * anchored on the source of a new document is copied and anchored on that new
 * document, and every `database` node of the new documents that showed one of
 * those databases (its own block, or a linked view elsewhere in the copied
 * pages, row pages included) now shows the copy. Databases copied together
 * keep their relations between the copies. A database the user cannot read
 * stays a linked view of the original; when the engine fails, every node is
 * left as it was.
 *
 * @param props the user, the new documents, and whether rows are copied.
 * @returns the number of databases copied.
 */
export async function documentDatabasesDuplicator({
  user,
  documents,
  withRecords = false,
  transaction,
}: Props): Promise<number> {
  if (!documents.length) {
    return 0;
  }

  // The given instances are rewritten in place, so that the caller presents
  // the new content; one query at a time, they share the transaction.
  const pages: { document: Document; content: ProsemirrorData }[] = [];
  for (const document of documents) {
    pages.push({ document, content: await DocumentHelper.toJSON(document) });
  }

  const duplications = await duplicationsFor(user, pages, transaction);
  if (!duplications.length) {
    return 0;
  }

  let duplicated;
  try {
    duplicated = await databasesDuplicator({
      user,
      duplications,
      withRecords,
      transaction,
    });
  } catch (err) {
    Logger.error(
      "Could not copy the databases of duplicated documents",
      toError(err),
      {
        documentIds: pages.map((page) => page.document.id),
      }
    );
    return 0;
  }

  for (const document of duplicated.flatMap((copy) => copy.rowPages)) {
    pages.push({ document, content: await DocumentHelper.toJSON(document) });
  }

  const nodeCopies = new Map<string, DatabaseNodeCopy>(
    duplicated.map((copy) => [
      copy.source.id,
      {
        databaseId: copy.database.id,
        viewIds: copy.viewIds,
        title: copy.database.title,
      },
    ])
  );
  for (const { document, content } of pages) {
    const { doc, rewritten } = rewriteDatabaseNodes(content, nodeCopies);
    if (!rewritten) {
      continue;
    }
    DocumentHelper.applyProsemirrorToDocument(
      document,
      Node.fromJSON(schema, doc)
    );
    await document.save({ transaction, silent: true });
  }

  return duplicated.length;
}

/**
 * The databases to copy: those shown in a new document and anchored on the
 * document it was made from, that the user can read.
 */
async function duplicationsFor(
  user: User,
  pages: { document: Document; content: ProsemirrorData }[],
  transaction?: Transaction | null
): Promise<DatabaseDuplication[]> {
  const shown = pages.flatMap(({ document, content }) => {
    const sourceId = sourceDocumentIdOf(document);
    const { collectionId } = document;
    return sourceId && collectionId
      ? databaseIdsIn(content).map((databaseId) => ({
          document,
          sourceId,
          collectionId,
          databaseId,
        }))
      : [];
  });
  if (!shown.length) {
    return [];
  }

  const databases = await Database.findAll({
    where: {
      id: [...new Set(shown.map((item) => item.databaseId))],
      teamId: user.teamId,
      documentId: [...new Set(shown.map((item) => item.sourceId))],
    },
    transaction,
  });
  // The sources and their anchors predate the transaction; reading them
  // outside of it lets the anchor's queries run side by side.
  await Promise.all(databases.map((database) => database.loadAnchor(user.id)));
  const readable = new Map(
    databases
      .filter((database) => can(user, "read", database))
      .map((database) => [database.id, database])
  );

  return shown.flatMap((item) => {
    const source = readable.get(item.databaseId);
    return source && source.documentId === item.sourceId
      ? [
          {
            source,
            collectionId: item.collectionId,
            documentId: item.document.id,
          },
        ]
      : [];
  });
}

function sourceDocumentIdOf(document: Document): string | null {
  return (
    document.sourceMetadata?.originalDocumentId ?? document.templateId ?? null
  );
}

import type { Transaction } from "sequelize";
import type { NavigationNode } from "@shared/types";
import { DocumentValidation } from "@shared/validations";
import { createContext } from "@server/context";
import { NotFoundError } from "@server/errors";
import type { Database, User } from "@server/models";
import { Collection, Document } from "@server/models";
import { ProsemirrorHelper } from "@server/models/helpers/ProsemirrorHelper";
import { sequelize } from "@server/storage/database";
import { LockHelper } from "@server/storage/LockHelper";
import type { APIContext } from "@server/types";

/** The acting user and the transaction to work in, when there is no request context. */
export interface DatabaseActorContext {
  user: User;
  transaction?: Transaction | null;
  ip?: string | null;
}

/** A route's `ctx.context`, or an acting user with an optional transaction. */
export type DatabaseCommandContext =
  | APIContext["context"]
  | DatabaseActorContext;

interface RowDocumentProps {
  /** The database the row belongs to. */
  database: Database;
  /** The engine id of the row. */
  recordId: string;
  /** The row's title, its primary field. */
  title: string;
  /** The row's emoji or icon, if any. */
  icon?: string | null;
}

interface RowLink {
  /** The engine id of the row. */
  recordId: string;
  /** The existing document that becomes the row's page. */
  documentId: string;
}

interface RowsLinkerProps {
  /** The database the rows belong to. */
  database: Database;
  /** The rows to link to their documents. */
  pairs: RowLink[];
}

/**
 * Returns the page of a database row, creating it on first use as a published
 * child of the database's home document (or at the root of its collection).
 * The page never enters the collection's document structure and publishing it
 * sends no event, so opening a card notifies nobody. The caller authorizes the
 * user on the database: reading it is enough, the publish right is not needed.
 *
 * @param ctx the request context, or the acting user with an optional transaction.
 * @param props.database the database the row belongs to.
 * @param props.recordId the engine id of the row.
 * @param props.title the row's title.
 * @param props.icon the row's icon, if any.
 * @returns the row's document, loaded with the user's memberships.
 * @throws NotFoundError when the database's home document no longer exists.
 */
export async function databaseRowDocumentCreator(
  ctx: DatabaseCommandContext,
  { database, recordId, title, icon }: RowDocumentProps
): Promise<Document> {
  const { user, transaction, ip } = resolveContext(ctx);

  const documentId = await inTransaction(transaction, async (t) => {
    await LockHelper.acquire(
      sequelize,
      `databaseRows:${database.id}:${recordId}`,
      t
    );

    const existing = await Document.unscoped().findOne({
      attributes: ["id"],
      where: { databaseId: database.id, databaseRecordId: recordId },
      transaction: t,
    });
    if (existing) {
      return existing.id;
    }

    const parent = database.documentId
      ? await Document.unscoped().findOne({
          attributes: ["id", "collectionId"],
          where: { id: database.documentId },
          transaction: t,
        })
      : null;
    if (database.documentId && !parent) {
      throw NotFoundError("The database's home document no longer exists");
    }
    const collectionId = parent?.collectionId ?? database.collectionId;

    const document = Document.build({
      databaseId: database.id,
      databaseRecordId: recordId,
      parentDocumentId: parent?.id ?? null,
      collectionId,
      teamId: database.teamId,
      title: title.slice(0, DocumentValidation.maxTitleLength),
      icon: icon ?? null,
      content: ProsemirrorHelper.toProsemirror("").toJSON(),
      text: "",
      createdById: user.id,
      lastModifiedById: user.id,
    });
    await document.save({ transaction: t });
    await document.publish(createContext({ user, transaction: t, ip }), {
      collectionId,
      event: false,
    });
    return document.id;
  });

  return Document.findByPk(documentId, {
    userId: user.id,
    rejectOnEmpty: true,
    transaction: transaction ?? undefined,
  });
}

/**
 * Turns existing documents into the pages of database rows, as the migration
 * does for cards imported as ordinary pages, and takes them out of the
 * collection's document structure in a single save (their sub-pages leave the
 * tree with them, as in Notion). Documents outside the database's team and
 * collection, the database's home document, and rows whose page is already
 * another document are skipped.
 *
 * @param ctx the request context, or the acting user with an optional transaction.
 * @param props.database the database the rows belong to.
 * @param props.pairs the rows and the documents to link them to.
 * @returns the number of documents linked.
 */
export async function databaseRowsLinker(
  ctx: DatabaseCommandContext,
  { database, pairs }: RowsLinkerProps
): Promise<number> {
  const { transaction } = resolveContext(ctx);
  const links = uniqueLinks(pairs).filter(
    (link) => link.documentId !== database.documentId
  );
  if (!links.length) {
    return 0;
  }

  return inTransaction(transaction, async (t) => {
    const taken = await Document.unscoped().findAll({
      attributes: ["id", "databaseRecordId"],
      where: {
        databaseId: database.id,
        databaseRecordId: links.map((link) => link.recordId),
      },
      transaction: t,
    });
    const pageByRecordId = new Map(
      taken.map((document) => [document.databaseRecordId, document.id])
    );

    const linkedIds = new Set<string>();
    for (const link of links) {
      const page = pageByRecordId.get(link.recordId);
      if (page && page !== link.documentId) {
        continue;
      }
      const [count] = await Document.unscoped().update(
        { databaseId: database.id, databaseRecordId: link.recordId },
        {
          where: {
            id: link.documentId,
            teamId: database.teamId,
            collectionId: database.collectionId,
          },
          silent: true,
          transaction: t,
        }
      );
      if (count) {
        linkedIds.add(link.documentId);
      }
    }

    if (!linkedIds.size) {
      return 0;
    }

    const collection = await Collection.findByPk(database.collectionId, {
      includeDocumentStructure: true,
      transaction: t,
      lock: t.LOCK.NO_KEY_UPDATE,
    });
    if (collection?.documentStructure) {
      collection.documentStructure = withoutNodes(
        collection.documentStructure,
        linkedIds
      );
      collection.changed("documentStructure", true);
      await collection.save({
        fields: ["documentStructure"],
        transaction: t,
      });
    }

    return linkedIds.size;
  });
}

function resolveContext(ctx: DatabaseCommandContext): DatabaseActorContext {
  if ("auth" in ctx) {
    return { user: ctx.auth.user, transaction: ctx.transaction, ip: ctx.ip };
  }
  return ctx;
}

function inTransaction<T>(
  transaction: Transaction | null | undefined,
  fn: (transaction: Transaction) => Promise<T>
): Promise<T> {
  return transaction ? fn(transaction) : sequelize.transaction(fn);
}

function uniqueLinks(pairs: RowLink[]): RowLink[] {
  const recordIds = new Set<string>();
  const documentIds = new Set<string>();
  return pairs.filter((pair) => {
    if (recordIds.has(pair.recordId) || documentIds.has(pair.documentId)) {
      return false;
    }
    recordIds.add(pair.recordId);
    documentIds.add(pair.documentId);
    return true;
  });
}

function withoutNodes(
  nodes: NavigationNode[],
  ids: Set<string>
): NavigationNode[] {
  return nodes
    .filter((node) => !ids.has(node.id))
    .map((node) => ({ ...node, children: withoutNodes(node.children, ids) }));
}

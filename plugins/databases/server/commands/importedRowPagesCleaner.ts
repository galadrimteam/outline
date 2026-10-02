import { Node } from "prosemirror-model";
import type { ProsemirrorData } from "@shared/types";
import { toError } from "@shared/utils/error";
import { createContext } from "@server/context";
import { schema } from "@server/editor";
import Logger from "@server/logging/Logger";
import type { Database, User } from "@server/models";
import { Document, Revision } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { sequelize } from "@server/storage/database";
import { engineFor, refFor } from "../engine";
import { actorFor } from "../utils/actor";
import { cellText } from "../utils/cellText";
import { mayHoldTitleLines, withoutRepeatedTitle } from "./rowPageTitle";
import type { RowPage } from "./rowPageTitle";
import { withoutPropertyTable } from "./rowPropertyTables";

/** What a cleanup of imported row pages did, or would do in a dry run. */
export interface RowPagesCleanup {
  /** Row pages read. */
  pages: number;
  /** Pages given back their whole title. */
  titles: number;
  /** Pages rid of their « Propriété | Valeur » table. */
  tables: number;
  /** Pages that could not be read or changed, left as they were. */
  failed: number;
  /** The pages changed, or that a dry run would change. */
  documentIds: string[];
  /** The offset of the next row pages to clean, null when none are left. */
  next: number | null;
}

interface CleanupOptions {
  /** The pages to clean; else the row pages of the database, in creation order, `limit` of them from `offset`. */
  documentIds?: string[];
  offset?: number;
  limit?: number;
  /** Counts what would change and changes nothing. */
  dryRun?: boolean;
}

interface Cleaned {
  page: RowPage;
  title: boolean;
  table: boolean;
}

/**
 * Takes out of the row pages of a database what the migration wrote on top of their body and the database now
 * shows: the « Propriété | Valeur » table (the properties panel holds it) and the repeat of a title Outline once had
 * to cut (the page title holds it again). Each page changed keeps its previous state as a revision, the collaborative
 * state follows so open editors see the change, and a page that fails is counted and left as it was. A second run
 * finds nothing to do.
 *
 * @param user the admin running the migration.
 * @param database the database the pages are rows of.
 * @param options the pages, and whether to only count.
 * @returns what changed, or would change.
 */
export async function importedRowPagesCleaner(
  user: User,
  database: Database,
  { documentIds, offset = 0, limit = 100, dryRun = false }: CleanupOptions = {}
): Promise<RowPagesCleanup> {
  const engine = engineFor(database);
  const actor = actorFor(user);
  const ref = refFor(database);
  const { fields } = await engine.getSchema(actor, ref);
  const fieldNames = fields.map((field) => field.name);
  const primary = fields.find((field) => field.isPrimary);
  const rowTitle = async (recordId: string | null) => {
    if (!primary || !recordId) {
      return null;
    }
    try {
      const record = await engine.getRecord(actor, ref, recordId);
      return cellText(record.fields[primary.id]);
    } catch {
      return null;
    }
  };
  const ids =
    documentIds ??
    (
      await Document.unscoped().findAll({
        attributes: ["id"],
        where: { databaseId: database.id },
        order: [
          ["createdAt", "ASC"],
          ["id", "ASC"],
        ],
        offset,
        limit,
      })
    ).map((document) => document.id);

  const result: RowPagesCleanup = {
    pages: 0,
    titles: 0,
    tables: 0,
    failed: 0,
    documentIds: [],
    next: !documentIds && ids.length === limit ? offset + limit : null,
  };
  for (const documentId of ids) {
    try {
      const document = await Document.unscoped().findOne({
        where: { id: documentId, databaseId: database.id },
      });
      if (!document) {
        continue;
      }
      result.pages += 1;
      const content = await DocumentHelper.toJSON(document);
      const title = mayHoldTitleLines(content)
        ? await rowTitle(document.databaseRecordId)
        : null;
      const planned = cleaned(document.title, content, title, fieldNames);
      const done =
        planned && !dryRun
          ? await save(user, database, documentId, title, fieldNames)
          : planned;
      if (done) {
        result.titles += Number(done.title);
        result.tables += Number(done.table);
        result.documentIds.push(documentId);
      }
    } catch (error) {
      result.failed += 1;
      Logger.warn("Could not clean an imported row page", {
        databaseId: database.id,
        documentId,
        error: toError(error).message,
      });
    }
  }
  return result;
}

/** The page read again under a lock, since someone may have edited it since it was read. */
async function save(
  user: User,
  database: Database,
  documentId: string,
  rowTitle: string | null,
  fieldNames: string[]
): Promise<Cleaned | null> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(`SET LOCAL lock_timeout = '5s';`, { transaction });
    const document = await Document.unscoped().findOne({
      where: { id: documentId, databaseId: database.id },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!document) {
      return null;
    }
    const change = cleaned(
      document.title,
      await DocumentHelper.toJSON(document),
      rowTitle,
      fieldNames
    );
    if (!change) {
      return null;
    }
    const ctx = createContext({ user, transaction });
    await Revision.createFromDocument(ctx, document);
    document.title = change.page.title;
    DocumentHelper.applyProsemirrorToDocument(
      document,
      Node.fromJSON(schema, change.page.content)
    );
    await document.save({ ...ctx.context, silent: true });
    return change;
  });
}

function cleaned(
  title: string,
  content: ProsemirrorData,
  rowTitle: string | null,
  fieldNames: string[]
): Cleaned | null {
  const retitled =
    rowTitle === null
      ? null
      : withoutRepeatedTitle({ title, content }, rowTitle);
  const page = retitled ?? { title, content };
  const withoutTable = withoutPropertyTable(page.content, fieldNames);
  if (!retitled && !withoutTable) {
    return null;
  }
  return {
    page: { title: page.title, content: withoutTable ?? page.content },
    title: !!retitled,
    table: !!withoutTable,
  };
}

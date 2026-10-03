import { Node } from "prosemirror-model";
import { Op, Sequelize } from "sequelize";
import type { ProsemirrorData } from "@shared/types";
import { toError } from "@shared/utils/error";
import { createContext } from "@server/context";
import { schema } from "@server/editor";
import Logger from "@server/logging/Logger";
import type { User } from "@server/models";
import { Collection, Database, Document } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { sequelize } from "@server/storage/database";
import { refFor } from "../engine";
import { retitleDatabaseNodes, showsAsFullPage } from "../utils/databaseNodes";
import { engineTableName, notionDatabaseName } from "../utils/tableNames";

/** What a fix of imported database titles did, or would do in a dry run. */
export interface ImportedTitlesFix {
  /** Databases examined. */
  databases: number;
  /** The databases renamed, or that a dry run would rename. */
  renamed: { id: string; from: string; to: string }[];
  /** Documents and collection overviews whose blocks were given the new names. */
  rewritten: number;
  /** Databases left as they were after an error, logged. */
  failed: number;
}

interface FixOptions {
  /** Only the databases of this collection; else every database of the team. */
  collectionId?: string;
  /** Lists what would change and changes nothing. */
  dryRun?: boolean;
}

/** A document or collection overview whose content shows a database. */
interface Holder {
  kind: "document" | "collection";
  id: string;
  /** The page title, or the collection name. */
  name: string;
  content: ProsemirrorData;
}

/**
 * Gives back their Notion name to imported databases that were named after
 * the page showing them: a database shown inside a page, whose title is the
 * title of a page holding it, takes the name of its engine table (without the
 * « (2) » the migration adds to a name taken twice). A database drawn as a
 * whole page keeps its page's title, as Notion's database page does; a
 * database renamed since, or whose table has no name, is left alone. The
 * blocks showing a renamed database get its new name too, silently, so that
 * nobody's page looks edited. A second run finds nothing to do.
 *
 * @param user the admin running the fix.
 * @param options the collection, and whether to only list.
 * @returns what changed, or would change.
 */
export async function importedDatabaseTitlesFixer(
  user: User,
  { collectionId, dryRun = false }: FixOptions = {}
): Promise<ImportedTitlesFix> {
  const databases = await Database.findAll({
    where: {
      teamId: user.teamId,
      ...(collectionId ? { collectionId } : {}),
    },
    order: [["createdAt", "ASC"]],
  });
  const result: ImportedTitlesFix = {
    databases: databases.length,
    renamed: [],
    rewritten: 0,
    failed: 0,
  };

  for (const database of databases) {
    try {
      const holders = await holdersOf(user.teamId, database.id);
      const title = database.title.trim();
      if (
        !title ||
        holders.some((holder) =>
          showsAsFullPage(holder.content, database.id)
        ) ||
        !holders.some((holder) => holder.name.trim() === title)
      ) {
        continue;
      }
      const name = notionDatabaseName(
        await engineTableName(user.teamId, database.engine, refFor(database))
      );
      if (!name || name === database.title) {
        continue;
      }

      result.renamed.push({ id: database.id, from: database.title, to: name });
      if (dryRun) {
        continue;
      }
      database.title = name.slice(0, 255);
      await database.save();
      for (const holder of holders) {
        result.rewritten += Number(
          await retitleBlocks(user, holder, database.id, database.title)
        );
      }
    } catch (error) {
      result.failed += 1;
      Logger.warn("Could not give an imported database its Notion name", {
        databaseId: database.id,
        error: toError(error).message,
      });
    }
  }
  return result;
}

async function holdersOf(teamId: string, databaseId: string) {
  const documents = await Document.unscoped().findAll({
    attributes: ["id", "title", "content"],
    where: { teamId, [Op.and]: [contentContains(databaseId)] },
  });
  const collections = await Collection.unscoped().findAll({
    attributes: ["id", "name", "content"],
    where: { teamId, [Op.and]: [contentContains(databaseId)] },
  });
  const holders: Holder[] = [
    ...documents.flatMap((document) =>
      document.content
        ? [
            {
              kind: "document" as const,
              id: document.id,
              name: document.title,
              content: document.content,
            },
          ]
        : []
    ),
    ...collections.flatMap((collection) =>
      collection.content
        ? [
            {
              kind: "collection" as const,
              id: collection.id,
              name: collection.name,
              content: collection.content,
            },
          ]
        : []
    ),
  ];
  return holders;
}

/** The holder read again under a lock, since someone may have edited it since it was read. */
function retitleBlocks(
  user: User,
  holder: Holder,
  databaseId: string,
  title: string
): Promise<boolean> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(`SET LOCAL lock_timeout = '5s';`, { transaction });
    if (holder.kind === "collection") {
      const collection = await Collection.unscoped().findOne({
        where: { id: holder.id, teamId: user.teamId },
        lock: transaction.LOCK.NO_KEY_UPDATE,
        transaction,
      });
      const change = collection?.content
        ? retitleDatabaseNodes(collection.content, databaseId, title)
        : undefined;
      if (!collection || !change?.rewritten) {
        return false;
      }
      collection.content = change.doc;
      await collection.save({ transaction, silent: true });
      return true;
    }

    const document = await Document.unscoped().findOne({
      where: { id: holder.id, teamId: user.teamId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!document) {
      return false;
    }
    const change = retitleDatabaseNodes(
      await DocumentHelper.toJSON(document),
      databaseId,
      title
    );
    if (!change.rewritten) {
      return false;
    }
    DocumentHelper.applyProsemirrorToDocument(
      document,
      Node.fromJSON(schema, change.doc)
    );
    // With the user in the context, open editing sessions receive the change.
    await document.save({
      ...createContext({ user, transaction }).context,
      silent: true,
    });
    return true;
  });
}

function contentContains(text: string) {
  return Sequelize.where(Sequelize.cast(Sequelize.col("content"), "text"), {
    [Op.like]: `%${text}%`,
  });
}

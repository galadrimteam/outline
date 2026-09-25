import { Node } from "prosemirror-model";
import type { Transaction } from "sequelize";
import { Op, Sequelize, UniqueConstraintError } from "sequelize";
import { UserRole } from "@shared/types";
import { toError } from "@shared/utils/error";
import { createContext } from "@server/context";
import { schema } from "@server/editor";
import Logger from "@server/logging/Logger";
import { Collection, Database, Document, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { BaseTask, TaskPriority } from "@server/queues/tasks/base/BaseTask";
import { sequelize } from "@server/storage/database";
import type { ResolvedDatabase, TeableEmbed } from "../utils/teableEmbeds";
import { convertTeableEmbeds, findTeableEmbeds } from "../utils/teableEmbeds";

/** Props of {@link ConvertTeableEmbedsTask}. */
export interface ConvertTeableEmbedsProps {
  /** The team whose content is converted. */
  teamId: string;
  /** Converts this document only. */
  documentId?: string;
  /** Converts the overview and every document of this collection. Without it nor a document, the whole team. */
  collectionId?: string;
  /** Counts what would change without writing anything. */
  dryRun?: boolean;
  /**
   * The user the conversion runs for. When it is not an admin, only embeds of
   * tables that already have a database are converted.
   */
  actorId?: string;
}

/** What a conversion changed, or would change on a dry run. */
export interface ConvertTeableEmbedsResult {
  /** Documents that may hold a Teable embed and were examined. */
  documents: number;
  /** Collection overviews examined. */
  collections: number;
  /** Documents rewritten. */
  changedDocuments: number;
  /** Collection overviews rewritten. */
  changedCollections: number;
  /** Embeds replaced by database nodes. */
  convertedEmbeds: number;
  /** Databases registered for tables that had none. */
  createdDatabases: number;
  /** Documents and overviews left as they were after an error, logged. */
  failed: number;
}

/**
 * Turns the Teable embeds of migrated documents and collection overviews into
 * native `database` nodes, registering an Outline database for every table
 * that has none yet. Documents are rewritten through their collaborative state
 * without an event and without moving `updatedAt`, and open editing sessions
 * receive the change. Running it again changes nothing.
 */
export class ConvertTeableEmbedsTask extends BaseTask<ConvertTeableEmbedsProps> {
  public async perform(
    props: ConvertTeableEmbedsProps
  ): Promise<ConvertTeableEmbedsResult> {
    const { teamId, dryRun = false } = props;
    const { user, canRegister } = await resolveActor(teamId, props.actorId);
    const run: ConversionRun = {
      teamId,
      user,
      dryRun,
      resolver: new DatabaseResolver({
        teamId,
        createdById: user.id,
        canRegister,
        dryRun,
      }),
    };
    const result: ConvertTeableEmbedsResult = {
      documents: 0,
      collections: 0,
      changedDocuments: 0,
      changedCollections: 0,
      convertedEmbeds: 0,
      createdDatabases: 0,
      failed: 0,
    };

    for (const documentId of await targetDocumentIds(props)) {
      result.documents += 1;
      try {
        const converted = await this.convertDocument(documentId, run);
        result.changedDocuments += converted ? 1 : 0;
        result.convertedEmbeds += converted;
      } catch (err) {
        // A single document is retried by the queue; in a batch, one
        // document must not hold back the others.
        if (props.documentId) {
          throw err;
        }
        result.failed += 1;
        Logger.error(
          "Could not convert the Teable embeds of a document",
          toError(err),
          {
            documentId,
          }
        );
      }
    }

    for (const collectionId of await targetCollectionIds(props)) {
      result.collections += 1;
      try {
        const converted = await this.convertCollection(collectionId, run);
        result.changedCollections += converted ? 1 : 0;
        result.convertedEmbeds += converted;
      } catch (err) {
        result.failed += 1;
        Logger.error(
          "Could not convert the Teable embeds of a collection overview",
          toError(err),
          { collectionId }
        );
      }
    }

    result.createdDatabases = run.resolver.created;
    Logger.info(
      "task",
      dryRun ? "Teable embeds to convert" : "Teable embeds converted",
      { ...props, ...result }
    );
    return result;
  }

  public get options() {
    return {
      priority: TaskPriority.Background,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60 * 1000,
      },
    };
  }

  private convertDocument(
    documentId: string,
    run: ConversionRun
  ): Promise<number> {
    return sequelize.transaction(async (transaction) => {
      await sequelize.query(`SET LOCAL lock_timeout = '5s';`, { transaction });

      const document = await Document.unscoped().findOne({
        where: { id: documentId, teamId: run.teamId },
        lock: run.dryRun ? undefined : transaction.LOCK.UPDATE,
        transaction,
      });
      if (!document) {
        return 0;
      }

      const content = await DocumentHelper.toJSON(document);
      const embeds = findTeableEmbeds(content);
      if (!embeds.length) {
        return 0;
      }

      const resolve = await run.resolver.resolve(
        embeds,
        {
          collectionId: document.collectionId ?? null,
          documentId: document.id,
          title: document.title,
        },
        transaction
      );
      const { doc, converted } = convertTeableEmbeds(content, resolve);
      if (!converted || run.dryRun) {
        return converted;
      }

      DocumentHelper.applyProsemirrorToDocument(
        document,
        Node.fromJSON(schema, doc)
      );
      // With the user in the context, the notifyCollaborationServer hook
      // pushes the new state into open editing sessions once committed; with
      // no event in it, nothing else hears about the change.
      await document.save({
        ...createContext({ user: run.user, transaction }).context,
        silent: true,
      });
      return converted;
    });
  }

  private convertCollection(
    collectionId: string,
    run: ConversionRun
  ): Promise<number> {
    return sequelize.transaction(async (transaction) => {
      await sequelize.query(`SET LOCAL lock_timeout = '5s';`, { transaction });

      const collection = await Collection.unscoped().findOne({
        where: { id: collectionId, teamId: run.teamId },
        lock: run.dryRun ? undefined : transaction.LOCK.NO_KEY_UPDATE,
        transaction,
      });
      if (!collection) {
        return 0;
      }

      const content = await DocumentHelper.toJSON(collection);
      const embeds = findTeableEmbeds(content);
      if (!embeds.length) {
        return 0;
      }

      const resolve = await run.resolver.resolve(
        embeds,
        {
          collectionId: collection.id,
          documentId: null,
          title: collection.name,
        },
        transaction
      );
      const { doc, converted } = convertTeableEmbeds(content, resolve);
      if (!converted || run.dryRun) {
        return converted;
      }

      collection.content = doc;
      await collection.save({ transaction, silent: true });
      return converted;
    });
  }
}

interface ConversionRun {
  teamId: string;
  /** The admin the documents are saved as. */
  user: User;
  dryRun: boolean;
  resolver: DatabaseResolver;
}

/** Where the embeds being converted live. */
interface ConversionTarget {
  collectionId: string | null;
  /** Null for a collection overview. */
  documentId: string | null;
  title: string;
}

interface Anchor {
  collectionId: string;
  documentId: string | null;
  /** The title of the anchor document, when the database is its content. */
  title: string | null;
}

interface KnownDatabase {
  id: string;
  externalBaseId: string;
  title: string;
}

interface ResolverOptions {
  teamId: string;
  createdById: string;
  /** Whether databases may be registered for tables that have none. */
  canRegister: boolean;
  dryRun: boolean;
}

/**
 * Finds the Outline database of each embedded table, registering one when
 * there is none. The anchor of a new database is, in order: the parent of the
 * table's existing row pages; the document the table fills (a full-page
 * database); the only document that embeds the table; else its collection.
 */
class DatabaseResolver {
  public created = 0;

  /** The databases a dry run would register, by table id. */
  private planned = new Map<string, KnownDatabase>();

  public constructor(private readonly options: ResolverOptions) {}

  /**
   * Resolves the tables of the given embeds.
   *
   * @param embeds the Teable embeds of the target.
   * @param target where the embeds live.
   * @param transaction the transaction of the conversion.
   * @returns the resolve function to pass to convertTeableEmbeds.
   */
  public async resolve(
    embeds: TeableEmbed[],
    target: ConversionTarget,
    transaction: Transaction
  ): Promise<(embed: TeableEmbed) => ResolvedDatabase | null> {
    const databases = new Map<string, KnownDatabase>();
    for (const tableId of new Set(embeds.map((embed) => embed.tableId))) {
      const database = await this.databaseFor(
        tableId,
        embeds.filter((embed) => embed.tableId === tableId),
        target,
        transaction
      );
      if (database) {
        databases.set(tableId, database);
      }
    }

    // Table ids are unique across Teable, so an embed whose base differs from
    // the registered one was not written by Teable: it is left alone.
    return (embed) => {
      const database = databases.get(embed.tableId);
      return database && database.externalBaseId === embed.baseId
        ? { databaseId: database.id, title: database.title }
        : null;
    };
  }

  private async databaseFor(
    tableId: string,
    embeds: TeableEmbed[],
    target: ConversionTarget,
    transaction: Transaction
  ): Promise<KnownDatabase | null> {
    const existing = await Database.findOne({
      where: { teamId: this.options.teamId, externalTableId: tableId },
      transaction,
    });
    if (existing) {
      return this.adoptRowPagesParent(existing, transaction);
    }
    return (
      this.planned.get(tableId) ??
      this.register(tableId, embeds, target, transaction)
    );
  }

  private async register(
    tableId: string,
    embeds: TeableEmbed[],
    target: ConversionTarget,
    transaction: Transaction
  ): Promise<KnownDatabase | null> {
    if (!this.options.canRegister || !target.collectionId) {
      return null;
    }

    const embed = embeds.find((e) => e.fullPage) ?? embeds[0];
    const anchor = await this.chooseAnchor(
      tableId,
      embeds,
      { ...target, collectionId: target.collectionId },
      transaction
    );
    const title = (anchor.title ?? embed.heading ?? target.title).slice(0, 255);

    if (this.options.dryRun) {
      const planned = {
        id: `dry-run-${tableId}`,
        externalBaseId: embed.baseId,
        title,
      };
      this.planned.set(tableId, planned);
      this.created += 1;
      return planned;
    }

    try {
      const database = await sequelize.transaction(
        { transaction },
        (savepoint) =>
          Database.create(
            {
              teamId: this.options.teamId,
              collectionId: anchor.collectionId,
              documentId: anchor.documentId,
              title,
              engine: "teable",
              externalBaseId: embed.baseId,
              externalTableId: tableId,
              createdById: this.options.createdById,
            },
            { transaction: savepoint }
          )
      );
      transaction.afterCommit(() => {
        this.created += 1;
      });
      Logger.info("task", "Registered a database for a Teable embed", {
        databaseId: database.id,
        tableId,
        collectionId: anchor.collectionId,
        documentId: anchor.documentId,
      });
      return database;
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) {
        throw err;
      }
      // Registered meanwhile by another request (databases.register).
      return Database.findOne({
        where: { teamId: this.options.teamId, externalTableId: tableId },
        transaction,
      });
    }
  }

  private async chooseAnchor(
    tableId: string,
    embeds: TeableEmbed[],
    target: ConversionTarget & { collectionId: string },
    transaction: Transaction
  ): Promise<Anchor> {
    const rowPagesParent = await this.rowPagesParent(tableId, transaction);
    if (rowPagesParent) {
      return rowPagesParent;
    }

    if (target.documentId && embeds.some((embed) => embed.fullPage)) {
      return {
        collectionId: target.collectionId,
        documentId: target.documentId,
        title: target.title,
      };
    }

    const others = await Document.unscoped().findAll({
      attributes: ["id", "title", "collectionId", "content"],
      where: {
        teamId: this.options.teamId,
        collectionId: { [Op.ne]: null },
        publishedAt: { [Op.ne]: null },
        template: false,
        ...(target.documentId ? { id: { [Op.ne]: target.documentId } } : {}),
        [Op.and]: [contentContains(tableId)],
      },
      limit: 50,
      transaction,
    });

    const page = others.find(
      (document) =>
        document.content &&
        findTeableEmbeds(document.content).some(
          (embed) => embed.tableId === tableId && embed.fullPage
        )
    );
    if (page?.collectionId) {
      return {
        collectionId: page.collectionId,
        documentId: page.id,
        title: page.title,
      };
    }

    if (target.documentId && !others.length) {
      return {
        collectionId: target.collectionId,
        documentId: target.documentId,
        title: null,
      };
    }

    return {
      collectionId: target.collectionId,
      documentId: null,
      title: null,
    };
  }

  /**
   * A database registered at the collection level moves under the document
   * its row pages were imported under: the page that showed it in Notion.
   */
  private async adoptRowPagesParent(
    database: Database,
    transaction: Transaction
  ): Promise<KnownDatabase> {
    if (database.documentId || !this.options.canRegister) {
      return database;
    }

    const parent = await this.rowPagesParent(
      database.externalTableId,
      transaction
    );
    if (!parent?.documentId || parent.collectionId !== database.collectionId) {
      return database;
    }

    Logger.info("task", "Anchored a database under its row pages' parent", {
      databaseId: database.id,
      documentId: parent.documentId,
    });
    if (!this.options.dryRun) {
      database.documentId = parent.documentId;
      await database.save({ transaction });
    }
    return database;
  }

  /**
   * The document every row page of the table sits under, if they share one.
   * Deleted databases of the table count: their row pages are still there.
   */
  private async rowPagesParent(
    tableId: string,
    transaction: Transaction
  ): Promise<Anchor | null> {
    const databases = await Database.findAll({
      attributes: ["id"],
      where: { teamId: this.options.teamId, externalTableId: tableId },
      paranoid: false,
      transaction,
    });
    if (!databases.length) {
      return null;
    }

    const parents = await Document.unscoped().findAll({
      attributes: ["parentDocumentId"],
      where: {
        databaseId: databases.map((database) => database.id),
        parentDocumentId: { [Op.ne]: null },
      },
      group: ["parentDocumentId"],
      limit: 2,
      transaction,
    });
    const parentId = parents.length === 1 ? parents[0].parentDocumentId : null;
    if (!parentId) {
      return null;
    }

    const parent = await Document.unscoped().findOne({
      attributes: ["id", "title", "collectionId"],
      where: { id: parentId, teamId: this.options.teamId },
      transaction,
    });
    return parent?.collectionId
      ? {
          collectionId: parent.collectionId,
          documentId: parent.id,
          title: parent.title,
        }
      : null;
  }
}

async function resolveActor(
  teamId: string,
  actorId: string | undefined
): Promise<{ user: User; canRegister: boolean }> {
  const actor = actorId
    ? await User.findOne({ where: { id: actorId, teamId } })
    : null;
  const user = actor?.isAdmin
    ? actor
    : await User.findOne({
        where: { teamId, role: UserRole.Admin, suspendedAt: null },
        order: [["createdAt", "ASC"]],
      });
  if (!user) {
    throw new Error(`No admin to convert the Teable embeds of team ${teamId}`);
  }
  // A table id in an embed is a claim, not a right: only an admin (or the
  // operator running the task directly) may register the table it names.
  return { user, canRegister: !actorId || !!actor?.isAdmin };
}

async function targetDocumentIds(
  props: ConvertTeableEmbedsProps
): Promise<string[]> {
  if (props.documentId) {
    return [props.documentId];
  }

  const documents = await Document.unscoped().findAll({
    attributes: ["id"],
    where: {
      teamId: props.teamId,
      template: false,
      ...(props.collectionId ? { collectionId: props.collectionId } : {}),
      [Op.or]: [{ content: { [Op.is]: null } }, contentContains("://teable.")],
    },
    order: [["createdAt", "ASC"]],
  });
  return documents.map((document) => document.id);
}

async function targetCollectionIds(
  props: ConvertTeableEmbedsProps
): Promise<string[]> {
  if (props.documentId) {
    return [];
  }
  if (props.collectionId) {
    return [props.collectionId];
  }

  const collections = await Collection.unscoped().findAll({
    attributes: ["id"],
    where: {
      teamId: props.teamId,
      [Op.and]: [contentContains("://teable.")],
    },
    order: [["createdAt", "ASC"]],
  });
  return collections.map((collection) => collection.id);
}

function contentContains(text: string) {
  return Sequelize.where(Sequelize.cast(Sequelize.col("content"), "text"), {
    [Op.like]: `%${text}%`,
  });
}

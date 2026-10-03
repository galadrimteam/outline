import type {
  InferAttributes,
  InferCreationAttributes,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op, literal } from "sequelize";
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Length,
  Table,
} from "sequelize-typescript";
import type { DatabaseSettings } from "@shared/databases/types";
import Collection from "./Collection";
import Document from "./Document";
import Team from "./Team";
import User from "./User";
import ParanoidModel from "./base/ParanoidModel";

/** SQL condition on a database: it keeps its row pages in the collection's tree. */
const keepsRowsInTree = `"settings" @> '{"rowsInSidebar": true}'`;

/**
 * A database: an engine table (Teable) shown natively in Outline. Its rights
 * follow its anchor, the home document when there is one, else the collection.
 */
@Table({ tableName: "databases", modelName: "database" })
class Database extends ParanoidModel<
  InferAttributes<Database>,
  Partial<InferCreationAttributes<Database>>
> {
  /**
   * Finds a database with the anchor document loaded for the given user, so
   * that policies can see the user's memberships on it.
   *
   * @param id the database id.
   * @param userId the user the anchor's memberships are loaded for.
   * @param options.transaction an optional transaction.
   * @returns the database, or null.
   */
  static async findByPkForUser(
    id: string,
    userId: string | undefined,
    options: { transaction?: Transaction } = {}
  ): Promise<Database | null> {
    const database = await this.findByPk(id, {
      transaction: options.transaction,
    });
    if (!database) {
      return null;
    }
    await database.loadAnchor(userId, options);
    return database;
  }

  /**
   * Returns the documents among the given ones that stay out of their
   * collection's tree: the pages of database rows, unless their database keeps
   * its rows in the tree (`settings.rowsInSidebar`).
   *
   * @param documents the documents, with their database.
   * @param options.transaction an optional transaction.
   * @returns the ids of the documents left out of the tree.
   */
  static async rowPageIdsOutsideTree(
    documents: Pick<Document, "id" | "databaseId">[],
    options: { transaction?: Transaction | null } = {}
  ): Promise<Set<string>> {
    const rowPages = documents.filter((document) => document.databaseId);
    if (!rowPages.length) {
      return new Set();
    }
    const inTree = await this.findAll({
      attributes: ["id"],
      where: {
        [Op.and]: [
          {
            id: [...new Set(rowPages.map((document) => document.databaseId!))],
          },
          literal(keepsRowsInTree),
        ],
      },
      transaction: options.transaction,
    });
    const keeping = new Set(inTree.map((database) => database.id));
    return new Set(
      rowPages
        .filter((document) => !keeping.has(document.databaseId!))
        .map((document) => document.id)
    );
  }

  /**
   * A condition on documents that keeps those belonging in a collection's tree:
   * ordinary pages, and the row pages of databases that keep their rows there.
   *
   * @returns the where options.
   */
  static inTreeWhere(): WhereOptions<Document> {
    return {
      [Op.or]: [
        { databaseId: { [Op.is]: null } },
        {
          databaseId: {
            [Op.in]: literal(
              `(SELECT "id" FROM "databases" WHERE "deletedAt" IS NULL AND ${keepsRowsInTree})`
            ),
          },
        },
      ],
    };
  }

  /** Whether the row pages keep their place in the collection's tree. */
  get rowsInSidebar(): boolean {
    return !!this.settings?.rowsInSidebar;
  }

  @Length({ max: 255, msg: "title must be 255 characters or less" })
  @Default("")
  @Column(DataType.STRING)
  title: string;

  @AllowNull
  @Column(DataType.STRING)
  icon: string | null;

  @Default("teable")
  @Column(DataType.STRING)
  engine: string;

  @Column(DataType.STRING)
  externalBaseId: string;

  @Column(DataType.STRING)
  externalTableId: string;

  @Default({})
  @Column(DataType.JSONB)
  settings: DatabaseSettings;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => Collection, "collectionId")
  collection: Collection | null;

  @ForeignKey(() => Collection)
  @Column(DataType.UUID)
  collectionId: string;

  @BelongsTo(() => Document, "documentId")
  document: Document | null;

  @ForeignKey(() => Document)
  @AllowNull
  @Column(DataType.UUID)
  documentId: string | null;

  @BelongsTo(() => User, "createdById")
  createdBy: User | null;

  @ForeignKey(() => User)
  @AllowNull
  @Column(DataType.UUID)
  createdById: string | null;

  /**
   * Loads the anchor of the database (home document with the user's
   * memberships, and the collection with the user's memberships).
   *
   * @param userId the user the memberships are loaded for.
   * @param options.transaction an optional transaction.
   */
  async loadAnchor(
    userId: string | undefined,
    options: { transaction?: Transaction } = {}
  ) {
    const [document, collection] = await Promise.all([
      this.documentId
        ? Document.findByPk(this.documentId, {
            userId,
            transaction: options.transaction,
          })
        : Promise.resolve(null),
      Collection.findByPk(this.collectionId, {
        userId,
        transaction: options.transaction,
      }),
    ]);
    this.document = document;
    this.collection = collection;
  }
}

export default Database;

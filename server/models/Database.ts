import type {
  InferAttributes,
  InferCreationAttributes,
  Transaction,
} from "sequelize";
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
      Collection.scope(
        userId ? { method: ["withMembership", userId] } : "defaultScope"
      ).findByPk(this.collectionId, { transaction: options.transaction }),
    ]);
    this.document = document;
    this.collection = collection;
  }
}

export default Database;

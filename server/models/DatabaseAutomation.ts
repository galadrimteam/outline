import type { InferAttributes, InferCreationAttributes } from "sequelize";
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
import type {
  DatabaseAutomationAction,
  DatabaseAutomationTrigger,
} from "@shared/databases/automations";
import type { DatabaseFilter } from "@shared/databases/types";
import Database from "./Database";
import Team from "./Team";
import User from "./User";
import ParanoidModel from "./base/ParanoidModel";

/**
 * An automation of a database: when its trigger fires on a row that matches
 * its conditions, its actions run. The rights follow the database's.
 */
@Table({ tableName: "database_automations", modelName: "database_automation" })
class DatabaseAutomation extends ParanoidModel<
  InferAttributes<DatabaseAutomation>,
  Partial<InferCreationAttributes<DatabaseAutomation>>
> {
  @Length({ max: 255, msg: "name must be 255 characters or less" })
  @Default("")
  @Column(DataType.STRING)
  name: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  enabled: boolean;

  @Column(DataType.JSONB)
  trigger: DatabaseAutomationTrigger;

  @AllowNull
  @Column(DataType.JSONB)
  conditions: DatabaseFilter | null;

  @Default([])
  @Column(DataType.JSONB)
  actions: DatabaseAutomationAction[];

  @AllowNull
  @Column(DataType.DATE)
  lastRunAt: Date | null;

  @AllowNull
  @Column(DataType.TEXT)
  lastError: string | null;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => Database, "databaseId")
  database: Database;

  @ForeignKey(() => Database)
  @Column(DataType.UUID)
  databaseId: string;

  @BelongsTo(() => User, "createdById")
  createdBy: User | null;

  @ForeignKey(() => User)
  @AllowNull
  @Column(DataType.UUID)
  createdById: string | null;
}

export default DatabaseAutomation;

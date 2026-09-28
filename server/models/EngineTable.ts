import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  PrimaryKey,
  Table,
  UpdatedAt,
} from "sequelize-typescript";
import Team from "./Team";
import Model from "./base/Model";

/**
 * A table of the Outline database engine: the rows, fields and views behind
 * one or several databases, kept in Outline's Postgres instead of Teable.
 */
@Table({ tableName: "engine_tables", modelName: "engine_table" })
class EngineTable extends Model<
  InferAttributes<EngineTable>,
  Partial<InferCreationAttributes<EngineTable>>
> {
  /** `tbl` + 16 letters or digits, or the Teable id of a table moved from Teable. */
  @PrimaryKey
  @Column(DataType.STRING)
  id: string;

  @Column(DataType.STRING)
  baseId: string;

  @Default("")
  @Column(DataType.STRING)
  name: string;

  /** Bumped by every write; pg returns BIGINT as a string. */
  @Default(0)
  @Column(DataType.BIGINT)
  version: number | string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // associations

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;
}

export default EngineTable;

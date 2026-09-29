import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import type { DatabaseCellValue } from "@shared/databases/types";
import EngineTable from "./EngineTable";
import Model from "./base/Model";

/**
 * A row of an Outline engine table: its stored cells by field id (computed
 * cells are never stored) and its manual position in each view.
 */
@Table({
  tableName: "engine_records",
  modelName: "engine_record",
  timestamps: false,
})
class EngineRecord extends Model<
  InferAttributes<EngineRecord>,
  Partial<InferCreationAttributes<EngineRecord>>
> {
  @PrimaryKey
  @Column(DataType.STRING)
  id: string;

  @Default({})
  @Column(DataType.JSONB)
  cells: Record<string, DatabaseCellValue>;

  @Column(DataType.INTEGER)
  autoNumber: number;

  @Default({})
  @Column(DataType.JSONB)
  orders: Record<string, number>;

  @Column(DataType.DATE)
  createdTime: Date;

  @Column(DataType.DATE)
  lastModifiedTime: Date;

  /** Engine user id: an Outline user id, or `email:<address>`. */
  @AllowNull
  @Column(DataType.STRING)
  createdById: string | null;

  @AllowNull
  @Column(DataType.STRING)
  lastModifiedById: string | null;

  // associations

  @BelongsTo(() => EngineTable, "tableId")
  table: EngineTable;

  @ForeignKey(() => EngineTable)
  @Column(DataType.STRING)
  tableId: string;
}

export default EngineRecord;

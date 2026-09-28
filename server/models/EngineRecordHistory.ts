import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  AllowNull,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import type { DatabaseCellValue } from "@shared/databases/types";
import EngineTable from "./EngineTable";
import Model from "./base/Model";

/** A cell change of an Outline engine record, for the record's history. */
@Table({
  tableName: "engine_record_history",
  modelName: "engine_record_history",
  updatedAt: false,
})
class EngineRecordHistory extends Model<
  InferAttributes<EngineRecordHistory>,
  Partial<InferCreationAttributes<EngineRecordHistory>>
> {
  @PrimaryKey
  @Column(DataType.STRING)
  id: string;

  @Column(DataType.STRING)
  recordId: string;

  @Column(DataType.STRING)
  fieldId: string;

  @AllowNull
  @Column(DataType.JSONB)
  before: DatabaseCellValue;

  @AllowNull
  @Column(DataType.JSONB)
  after: DatabaseCellValue;

  /** Engine user id of the person who made the change. */
  @AllowNull
  @Column(DataType.STRING)
  actorId: string | null;

  @CreatedAt
  createdAt: Date;

  // associations

  @BelongsTo(() => EngineTable, "tableId")
  table: EngineTable;

  @ForeignKey(() => EngineTable)
  @Column(DataType.STRING)
  tableId: string;
}

export default EngineRecordHistory;

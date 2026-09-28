import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  AllowNull,
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
import type {
  DatabaseCellValueType,
  DatabaseFieldOptions,
  DatabaseFieldType,
  DatabaseLookupOptions,
} from "@shared/databases/types";
import EngineTable from "./EngineTable";
import Model from "./base/Model";

/** A field of an Outline engine table, in Teable's vocabulary. */
@Table({ tableName: "engine_fields", modelName: "engine_field" })
class EngineField extends Model<
  InferAttributes<EngineField>,
  Partial<InferCreationAttributes<EngineField>>
> {
  @PrimaryKey
  @Column(DataType.STRING)
  id: string;

  @Default("")
  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  type: DatabaseFieldType;

  @AllowNull
  @Column(DataType.TEXT)
  description: string | null;

  @Default({})
  @Column(DataType.JSONB)
  options: DatabaseFieldOptions;

  @AllowNull
  @Column(DataType.JSONB)
  lookupOptions: DatabaseLookupOptions | null;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isPrimary: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isComputed: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isLookup: boolean;

  @Default("string")
  @Column(DataType.STRING)
  cellValueType: DatabaseCellValueType;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isMultipleCellValue: boolean;

  @Default(0)
  @Column(DataType.DOUBLE)
  order: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // associations

  @BelongsTo(() => EngineTable, "tableId")
  table: EngineTable;

  @ForeignKey(() => EngineTable)
  @Column(DataType.STRING)
  tableId: string;
}

export default EngineField;

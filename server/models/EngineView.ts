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
  DatabaseColumnMeta,
  DatabaseEngineViewType,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseSort,
  DatabaseViewOptions,
} from "@shared/databases/types";
import EngineTable from "./EngineTable";
import Model from "./base/Model";

/** A view of an Outline engine table, in Teable's vocabulary. */
@Table({ tableName: "engine_views", modelName: "engine_view" })
class EngineView extends Model<
  InferAttributes<EngineView>,
  Partial<InferCreationAttributes<EngineView>>
> {
  @PrimaryKey
  @Column(DataType.STRING)
  id: string;

  @Default("")
  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  type: DatabaseEngineViewType;

  @Default(0)
  @Column(DataType.DOUBLE)
  order: number;

  @AllowNull
  @Column(DataType.TEXT)
  description: string | null;

  @AllowNull
  @Column(DataType.JSONB)
  filter: DatabaseFilter | null;

  @AllowNull
  @Column(DataType.JSONB)
  sort: DatabaseSort | null;

  @AllowNull
  @Column(DataType.JSONB)
  group: DatabaseGroup | null;

  @Default({})
  @Column(DataType.JSONB)
  columnMeta: Record<string, DatabaseColumnMeta>;

  @Default({})
  @Column(DataType.JSONB)
  options: DatabaseViewOptions;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isLocked: boolean;

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

export default EngineView;

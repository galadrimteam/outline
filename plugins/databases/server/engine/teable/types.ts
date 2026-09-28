import type {
  DatabaseCellValueType,
  DatabaseColumnMeta,
  DatabaseEngineViewType,
  DatabaseFieldOptions,
  DatabaseFieldType,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseSort,
  DatabaseStatisticFunc,
  DatabaseViewOptions,
} from "@shared/databases/types";

/*
 * The shapes of Teable's REST API (packages/openapi, packages/core/src/models)
 * that the engine reads. Teable's vocabulary is kept on purpose: field types,
 * options, filters and view options are the same words in both.
 */

/** Teable's IFieldVo. */
export interface TeableField {
  id: string;
  name: string;
  type: DatabaseFieldType;
  description?: string | null;
  options?: DatabaseFieldOptions | null;
  isLookup?: boolean | null;
  lookupOptions?: {
    foreignTableId: string;
    linkFieldId: string;
    lookupFieldId: string;
  } | null;
  isPrimary?: boolean | null;
  isComputed?: boolean | null;
  cellValueType: DatabaseCellValueType;
  isMultipleCellValue?: boolean | null;
}

/** Teable's IViewVo. */
export interface TeableView {
  id: string;
  name: string;
  type: DatabaseEngineViewType;
  order?: number;
  description?: string | null;
  options?: DatabaseViewOptions | null;
  sort?: DatabaseSort | null;
  filter?: DatabaseFilter | null;
  group?: DatabaseGroup | null;
  isLocked?: boolean | null;
  columnMeta?: Record<string, DatabaseColumnMeta> | null;
}

/** Teable's IRecord, fields keyed by id (`fieldKeyType=id`). */
export interface TeableRecord {
  id: string;
  fields: Record<string, TeableCellValue>;
  createdTime?: string;
  lastModifiedTime?: string;
  createdBy?: string;
  lastModifiedBy?: string;
}

export type TeableCellValue =
  | string
  | number
  | boolean
  | null
  | TeableObjectValue
  | (string | number | boolean | TeableObjectValue)[];

/** A user, link or attachment item of a cell. */
export interface TeableObjectValue {
  id?: string;
  title?: string;
  email?: string;
  avatarUrl?: string | null;
  name?: string;
  path?: string;
  token?: string;
  size?: number;
  mimetype?: string;
  presignedUrl?: string;
  width?: number;
  height?: number;
  smThumbnailUrl?: string;
  lgThumbnailUrl?: string;
}

export interface TeableRecordsVo {
  records: TeableRecord[];
}

export interface TeableRowCountVo {
  rowCount: number;
}

export interface TeableGroupHeaderPoint {
  type: 0;
  id: string;
  depth: number;
  value: TeableCellValue;
  isCollapsed: boolean;
}

export interface TeableGroupRowPoint {
  type: 1;
  count: number;
}

export type TeableGroupPoint = TeableGroupHeaderPoint | TeableGroupRowPoint;

export interface TeableAggregationVo {
  aggregations?: {
    fieldId: string;
    total: {
      value: string | number | null;
      aggFunc: DatabaseStatisticFunc;
    } | null;
  }[];
}

export interface TeableHistoryState {
  meta: { name: string; type: DatabaseFieldType };
  data: TeableCellValue;
}

export interface TeableHistoryVo {
  historyList: {
    id: string;
    fieldId: string;
    before: TeableHistoryState;
    after: TeableHistoryState;
    createdTime: string;
    createdBy: string;
  }[];
  userMap: Record<
    string,
    { id: string; name: string; email: string; avatar?: string | null }
  >;
  nextCursor?: string | null;
}

export interface TeableTableVo {
  id: string;
  name: string;
  fields: TeableField[];
  views: TeableView[];
}

/** Response of the fork's `POST /api/galadrim/space`. */
export interface TeableSpaceVo {
  spaceId: string;
}

export interface TeableBaseVo {
  id: string;
  name: string;
}

/** Response of the fork's `POST /api/galadrim/token`. */
export interface TeableTokenVo {
  userId: string;
  token: string;
  expiresAt?: string | number;
}

/** Response of the fork's `POST /api/galadrim/users/ensure`. */
export interface TeableEnsureUsersVo {
  users: { email: string; id: string }[];
}

import { z } from "zod";
import type {
  DatabaseDateFilterMode,
  DatabaseFilter,
  DatabaseFilterItem,
} from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseLayout,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import { BaseSchema } from "@server/routes/api/schema";
import { zodIconType, zodShareIdType } from "@server/utils/zod";

/** An engine id (table, field, view, record): never trusted beyond its format. */
const zEngineId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, {
  error: "must be an identifier",
});

/**
 * A client tag echoed by `databases.change`, so that a tab recognises its own
 * writes. "outline" is reserved for the server's own writes.
 */
const zOrigin = z
  .string()
  .regex(/^[A-Za-z0-9:_-]{1,64}$/)
  .refine((value) => value !== "outline", { error: "is reserved" })
  .optional();

const zPosition = z.enum(["before", "after"]);

const zRecordOrder = z.object({
  viewId: zEngineId,
  anchorId: zEngineId,
  position: zPosition,
});

const filterOperators = [
  "is",
  "isNot",
  "contains",
  "doesNotContain",
  "isGreater",
  "isGreaterEqual",
  "isLess",
  "isLessEqual",
  "isEmpty",
  "isNotEmpty",
  "isAnyOf",
  "isNoneOf",
  "hasAnyOf",
  "hasAllOf",
  "hasNoneOf",
  "isExactly",
  "isNotExactly",
  "isWithIn",
  "isBefore",
  "isAfter",
  "isOnOrBefore",
  "isOnOrAfter",
] as const;

/** Date filter modes are Teable's own words, passed through as they are. */
const zDateFilterMode = z.custom<DatabaseDateFilterMode>(
  (value) => typeof value === "string" && /^[A-Za-z]{1,64}$/.test(value),
  { error: "must be a date filter mode" }
);

const statisticFuncs = [
  "count",
  "empty",
  "filled",
  "unique",
  "max",
  "min",
  "sum",
  "average",
  "checked",
  "unChecked",
  "percentEmpty",
  "percentFilled",
  "percentUnique",
  "percentChecked",
  "percentUnChecked",
  "earliestDate",
  "latestDate",
  "dateRangeOfDays",
  "dateRangeOfMonths",
  "totalAttachmentSize",
] as const;

const zStatisticFunc = z.enum(statisticFuncs);

const zFilterValue = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(1000)).max(500),
  z.object({
    mode: zDateFilterMode,
    timeZone: z.string().max(100),
    exactDate: z.string().max(100).optional(),
    exactDateEnd: z.string().max(100).optional(),
    numberOfDays: z.number().optional(),
  }),
]);

const zFilterItem: z.ZodType<DatabaseFilterItem> = z.object({
  fieldId: zEngineId,
  operator: z.enum(filterOperators),
  value: zFilterValue,
});

const zFilter: z.ZodType<DatabaseFilter> = z.lazy(() =>
  z.object({
    conjunction: z.enum(["and", "or"]),
    filterSet: z.array(z.union([zFilterItem, zFilter])).max(100),
  })
);

const zSortItem = z.object({
  fieldId: zEngineId,
  order: z.enum(["asc", "desc"]),
});

const zSort = z.object({
  sortObjs: z.array(zSortItem).max(20),
  manualSort: z.boolean().optional(),
});

const zGroup = z.array(zSortItem).max(3);

const zSearch = z.string().trim().max(255).optional();

const zUserInput = z.object({ outlineUserId: z.uuid() });

const zUserValue = z.object({
  id: z.string().max(64),
  title: z.string().max(255),
  email: z.string().max(255).optional(),
  avatarUrl: z.string().max(2048).nullish(),
  outlineUserId: z.string().nullish(),
});

const zLinkValue = z.object({
  id: z.string().max(64),
  title: z.string().max(1000).optional(),
});

const zAttachmentValue = z.object({
  id: z.string().max(64),
  name: z.string().max(255),
  mimetype: z.string().max(255),
  size: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  url: z.string().max(4096).optional(),
  thumbnailUrl: z.string().max(4096).optional(),
  token: z.string().max(255).optional(),
  path: z.string().max(1024).optional(),
});

const zCellInput = z.union([
  z.string().max(100000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(10000)).max(1000),
  z.array(z.number()).max(1000),
  zUserInput,
  z.array(zUserInput).max(1000),
  zUserValue,
  z.array(zUserValue).max(1000),
  zLinkValue,
  z.array(zLinkValue).max(10000),
  z.array(zAttachmentValue).max(1000),
]);

const zCells = z
  .record(zEngineId, zCellInput)
  .refine((cells) => Object.keys(cells).length <= 500, {
    error: "too many fields",
  });

const zColumnMeta = z.object({
  order: z.number().optional(),
  width: z.number().optional(),
  hidden: z.boolean().optional(),
  visible: z.boolean().optional(),
  required: z.boolean().optional(),
  statisticFunc: zStatisticFunc.nullable().optional(),
  wrap: z.boolean().nullable().optional(),
});

/** An id the app clears with "": dropped on creation. */
const zIdOrEmpty = z
  .union([zEngineId, z.literal("")])
  .optional()
  .transform((value) => value || undefined);

/** An id the app clears with "" or null: null on update. */
const zIdOrUnset = z
  .union([zEngineId, z.literal("")])
  .nullish()
  .transform((value) => (value === "" ? null : value));

const viewOptionsShape = {
  isCoverFit: z.boolean().optional(),
  isFieldNameHidden: z.boolean().optional(),
  isEmptyStackHidden: z.boolean().optional(),
  colorConfig: z
    .object({
      type: z.enum(["field", "custom"]),
      fieldId: zIdOrEmpty,
      color: z.string().max(50).optional(),
    })
    .optional(),
  rowHeight: z
    .enum(["short", "medium", "tall", "extraTall", "autoFit"])
    .optional(),
  fieldNameDisplayLines: z.number().int().min(1).max(10).optional(),
  coverUrl: z.string().max(2048).optional(),
  logoUrl: z.string().max(2048).optional(),
  submitLabel: z.string().max(255).optional(),
};

const zViewOptions = z.object({
  ...viewOptionsShape,
  stackFieldId: zIdOrEmpty,
  coverFieldId: zIdOrEmpty,
  startDateFieldId: zIdOrEmpty,
  endDateFieldId: zIdOrEmpty,
  titleFieldId: zIdOrEmpty,
  frozenFieldId: zIdOrEmpty,
});

/** Options of `databaseViews.update`: "" or null clears an id. */
const zViewOptionsPatch = z.object({
  ...viewOptionsShape,
  stackFieldId: zIdOrUnset,
  coverFieldId: zIdOrUnset,
  startDateFieldId: zIdOrUnset,
  endDateFieldId: zIdOrUnset,
  titleFieldId: zIdOrUnset,
  frozenFieldId: zIdOrUnset,
});

const zTimelineOverrides = z.object({
  startFieldId: zIdOrEmpty,
  endFieldId: zIdOrEmpty,
  zoom: z.enum(["week", "month", "quarter", "year"]).optional(),
  dependencyFieldId: zIdOrEmpty,
  showTable: z.boolean().optional(),
});

const zGroupCalculation = z.object({
  func: z.union([zStatisticFunc, z.literal("none")]),
  fieldId: zEngineId.optional(),
});

const zLoadLimit = z.number().int().min(1).max(200);

const zViewOverrides = z.object({
  icon: zodIconType().optional(),
  layout: z.enum([DatabaseLayout.List, DatabaseLayout.Timeline]).optional(),
  subGroupFieldId: zIdOrEmpty,
  stackOrder: z.array(z.string().max(1000)).max(1000).optional(),
  hiddenStacks: z.array(z.string().max(1000)).max(1000).optional(),
  cardSize: z.enum(["small", "medium", "large"]).optional(),
  openPagesIn: z.enum(["sidePeek", "centerPeek", "fullPage"]).optional(),
  defaultTemplateId: z.uuid().optional(),
  timeline: zTimelineOverrides.optional(),
  subItems: z.enum(["nested", "flattened", "off"]).optional(),
  groupCalculation: zGroupCalculation.optional(),
  loadLimit: zLoadLimit.optional(),
});

/** Overrides of `databaseViews.update`: null (or "" for an id) removes a key. */
const zViewOverridesPatch = z.object({
  icon: zodIconType().nullish(),
  layout: z.enum([DatabaseLayout.List, DatabaseLayout.Timeline]).nullish(),
  subGroupFieldId: zIdOrUnset,
  stackOrder: z.array(z.string().max(1000)).max(1000).nullish(),
  hiddenStacks: z.array(z.string().max(1000)).max(1000).nullish(),
  cardSize: z.enum(["small", "medium", "large"]).nullish(),
  openPagesIn: z.enum(["sidePeek", "centerPeek", "fullPage"]).nullish(),
  defaultTemplateId: z.uuid().nullish(),
  timeline: zTimelineOverrides.nullish(),
  subItems: z.enum(["nested", "flattened", "off"]).nullish(),
  groupCalculation: zGroupCalculation.nullish(),
  loadLimit: zLoadLimit.nullish(),
});

const zFieldMeta = z.object({
  statusGroups: z
    .record(z.string().max(1000), z.enum(DatabaseStatusGroup))
    .optional(),
  endFieldId: zIdOrEmpty,
  icon: z.string().min(1).max(100).optional(),
});

const zPageTab = z
  .object({
    id: zEngineId,
    kind: z.enum(["content", "relation"]),
    name: z.string().max(1000).optional(),
    fieldId: zEngineId.optional(),
    visibleFieldIds: z.array(zEngineId).max(500).optional(),
  })
  .refine((tab) => tab.kind !== "relation" || !!tab.fieldId, {
    error: "a relation tab needs a fieldId",
  });

const zSettingsPatch = z.object({
  viewOverrides: z.record(zEngineId, zViewOverrides.nullable()).optional(),
  fieldMeta: z.record(zEngineId, zFieldMeta.nullable()).optional(),
  pageLayout: z
    .object({
      hiddenFieldIds: z.array(zEngineId).max(500).optional(),
      hideWhenEmptyFieldIds: z.array(zEngineId).max(500).optional(),
      hideEmpty: z.boolean().optional(),
      tabs: z.array(zPageTab).max(20).optional(),
      fieldOrder: z.array(zEngineId).max(500).optional(),
      pinnedFieldIds: z.array(zEngineId).max(500).optional(),
    })
    .nullish(),
  iconFieldId: zEngineId.nullish(),
  subItemFieldId: zEngineId.nullish(),
  rowsInSidebar: z.boolean().nullish(),
});

const zFieldOptions = z.object({
  choices: z
    .array(
      z.object({
        id: z.string().max(64).optional(),
        name: z.string().max(1000),
        color: z.string().max(50),
      })
    )
    .max(1000)
    .optional(),
  defaultValue: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
    .optional(),
  formatting: z
    .object({
      type: z.enum(["decimal", "percent", "currency"]).optional(),
      precision: z.number().int().min(0).max(10).optional(),
      symbol: z.string().max(10).optional(),
      date: z.string().max(100).optional(),
      time: z.string().max(100).optional(),
      timeZone: z.string().max(100).optional(),
    })
    .optional(),
  showAs: z
    .object({ type: z.string().max(50) })
    .catchall(z.union([z.string().max(100), z.number(), z.boolean()]))
    .optional(),
  isMultiple: z.boolean().optional(),
  shouldNotify: z.boolean().optional(),
  /** Links to the table of this Outline database; engine table ids never come from the client. */
  foreignDatabaseId: z.uuid().optional(),
  relationship: z.enum(["oneOne", "oneMany", "manyOne", "manyMany"]).optional(),
  lookupFieldId: zEngineId.optional(),
  symmetricFieldId: zEngineId.optional(),
  isOneWay: z.boolean().optional(),
  expression: z.string().max(10000).optional(),
  timeZone: z.string().max(100).optional(),
  max: z.number().int().min(1).max(10).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(50).optional(),
  label: z.string().max(255).optional(),
});

const zPageLimit = (max: number, fallback: number) =>
  z.number().int().min(1).max(max).default(fallback);

const zOffset = z.number().int().min(0).default(0);

// databases.*

export const DatabasesInfoSchema = BaseSchema.extend({
  body: z.object({ id: z.uuid(), shareId: zodShareIdType().optional() }),
});

export type DatabasesInfoReq = z.infer<typeof DatabasesInfoSchema>;

export const DatabasesListSchema = BaseSchema.extend({
  body: z.object({
    collectionId: z.uuid().optional(),
    query: z.string().trim().max(255).optional(),
    offset: zOffset,
    limit: zPageLimit(100, 25),
  }),
});

export type DatabasesListReq = z.infer<typeof DatabasesListSchema>;

export const DatabasesCreateSchema = BaseSchema.extend({
  body: z.object({
    collectionId: z.uuid(),
    documentId: z.uuid().optional(),
    title: z.string().trim().max(255).optional(),
    layout: z.enum(DatabaseLayout).default(DatabaseLayout.Table),
  }),
});

export type DatabasesCreateReq = z.infer<typeof DatabasesCreateSchema>;

export const DatabasesRegisterSchema = BaseSchema.extend({
  body: z.object({
    collectionId: z.uuid(),
    documentId: z.uuid().nullish(),
    externalBaseId: zEngineId,
    externalTableId: zEngineId,
    title: z.string().trim().max(255).optional(),
  }),
});

export type DatabasesRegisterReq = z.infer<typeof DatabasesRegisterSchema>;

export const DatabasesUpdateSchema = BaseSchema.extend({
  body: z.object({
    id: z.uuid(),
    title: z.string().trim().max(255).optional(),
    icon: z.string().max(255).nullish(),
    settings: zSettingsPatch.optional(),
  }),
});

export type DatabasesUpdateReq = z.infer<typeof DatabasesUpdateSchema>;

export const DatabasesDeleteSchema = BaseSchema.extend({
  body: z.object({ id: z.uuid() }),
});

export type DatabasesDeleteReq = z.infer<typeof DatabasesDeleteSchema>;

export const DatabasesLinkRowsSchema = BaseSchema.extend({
  body: z.object({
    id: z.uuid(),
    pairs: z
      .array(z.object({ recordId: zEngineId, documentId: z.uuid() }))
      .min(1)
      .max(1000),
  }),
});

export type DatabasesLinkRowsReq = z.infer<typeof DatabasesLinkRowsSchema>;

export const DatabasesConvertEmbedsSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.uuid().optional(),
    collectionId: z.uuid().optional(),
    dryRun: z.boolean().default(false),
  }),
});

export type DatabasesConvertEmbedsReq = z.infer<
  typeof DatabasesConvertEmbedsSchema
>;

export const DatabasesMoveToOutlineEngineSchema = BaseSchema.extend({
  body: z.object({
    /** A database of the Teable base to move: the whole base moves. */
    id: z.uuid(),
    dryRun: z.boolean().default(false),
  }),
});

export type DatabasesMoveToOutlineEngineReq = z.infer<
  typeof DatabasesMoveToOutlineEngineSchema
>;

// databaseRecords.*

export const DatabaseRecordsListSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    shareId: zodShareIdType().optional(),
    viewId: zEngineId,
    filter: zFilter.nullish(),
    /** The filter replaces the view's instead of narrowing it (editors only). */
    replaceFilter: z.boolean().default(false),
    sort: zSort.nullish(),
    search: zSearch,
    offset: zOffset,
    limit: zPageLimit(200, 100),
  }),
});

export type DatabaseRecordsListReq = z.infer<typeof DatabaseRecordsListSchema>;

export const DatabaseRecordsInfoSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordId: zEngineId,
    shareId: zodShareIdType().optional(),
  }),
});

export type DatabaseRecordsInfoReq = z.infer<typeof DatabaseRecordsInfoSchema>;

export const DatabaseRecordsCreateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    fields: zCells.default({}),
    order: zRecordOrder.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseRecordsCreateReq = z.infer<
  typeof DatabaseRecordsCreateSchema
>;

export const DatabaseRecordsUpdateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordId: zEngineId,
    fields: zCells,
    order: zRecordOrder.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseRecordsUpdateReq = z.infer<
  typeof DatabaseRecordsUpdateSchema
>;

export const DatabaseRecordsMoveSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    viewId: zEngineId,
    recordIds: z.array(zEngineId).min(1).max(1000),
    anchorId: zEngineId.optional(),
    position: zPosition.optional(),
    fields: zCells.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseRecordsMoveReq = z.infer<typeof DatabaseRecordsMoveSchema>;

export const DatabaseRecordsDeleteSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordIds: z.array(zEngineId).min(1).max(1000),
    origin: zOrigin,
  }),
});

export type DatabaseRecordsDeleteReq = z.infer<
  typeof DatabaseRecordsDeleteSchema
>;

export const DatabaseRecordsDuplicateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordId: zEngineId,
    order: zRecordOrder.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseRecordsDuplicateReq = z.infer<
  typeof DatabaseRecordsDuplicateSchema
>;

export const DatabaseRecordsOpenSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordId: zEngineId,
    shareId: zodShareIdType().optional(),
  }),
});

export type DatabaseRecordsOpenReq = z.infer<typeof DatabaseRecordsOpenSchema>;

export const DatabaseRecordsGroupsSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    shareId: zodShareIdType().optional(),
    viewId: zEngineId,
    groupBy: zGroup.nullish(),
    filter: zFilter.nullish(),
    search: zSearch,
  }),
});

export type DatabaseRecordsGroupsReq = z.infer<
  typeof DatabaseRecordsGroupsSchema
>;

export const DatabaseRecordsAggregateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    shareId: zodShareIdType().optional(),
    viewId: zEngineId,
    fieldStats: z
      .record(zEngineId, zStatisticFunc)
      .refine((stats) => Object.keys(stats).length <= 200, {
        error: "too many fields",
      }),
    filter: zFilter.nullish(),
    search: zSearch,
    byGroup: z.boolean().optional(),
  }),
});

export type DatabaseRecordsAggregateReq = z.infer<
  typeof DatabaseRecordsAggregateSchema
>;

export const DatabaseRecordsLinkCandidatesSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    fieldId: zEngineId,
    recordId: zEngineId.optional(),
    search: zSearch,
    offset: zOffset,
    limit: zPageLimit(100, 25),
  }),
});

export type DatabaseRecordsLinkCandidatesReq = z.infer<
  typeof DatabaseRecordsLinkCandidatesSchema
>;

export const DatabaseRecordsHistorySchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordId: zEngineId,
    cursor: z.string().max(255).optional(),
  }),
});

export type DatabaseRecordsHistoryReq = z.infer<
  typeof DatabaseRecordsHistorySchema
>;

export const DatabaseRecordsUploadSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordId: zEngineId,
    fieldId: zEngineId,
    origin: zOrigin,
  }),
});

export type DatabaseRecordsUploadReq = z.infer<
  typeof DatabaseRecordsUploadSchema
>;

// databaseFields.*

export const DatabaseFieldsCreateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    name: z.string().trim().min(1).max(255),
    type: z.enum(DatabaseFieldType),
    options: zFieldOptions.optional(),
    viewId: zEngineId.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseFieldsCreateReq = z.infer<
  typeof DatabaseFieldsCreateSchema
>;

export const DatabaseFieldsUpdateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    fieldId: zEngineId,
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10000).nullish(),
    origin: zOrigin,
  }),
});

export type DatabaseFieldsUpdateReq = z.infer<
  typeof DatabaseFieldsUpdateSchema
>;

export const DatabaseFieldsConvertSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    fieldId: zEngineId,
    type: z.enum(DatabaseFieldType),
    options: zFieldOptions.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseFieldsConvertReq = z.infer<
  typeof DatabaseFieldsConvertSchema
>;

export const DatabaseFieldsDuplicateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    fieldId: zEngineId,
    name: z.string().trim().min(1).max(255).optional(),
    viewId: zEngineId.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseFieldsDuplicateReq = z.infer<
  typeof DatabaseFieldsDuplicateSchema
>;

export const DatabaseFieldsDeleteSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    fieldId: zEngineId,
    origin: zOrigin,
  }),
});

export type DatabaseFieldsDeleteReq = z.infer<
  typeof DatabaseFieldsDeleteSchema
>;

// databaseViews.*

export const DatabaseViewsCreateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    name: z.string().trim().min(1).max(255),
    layout: z.enum(DatabaseLayout),
    options: zViewOptions.optional(),
    overrides: zViewOverrides.optional(),
    origin: zOrigin,
  }),
});

export type DatabaseViewsCreateReq = z.infer<typeof DatabaseViewsCreateSchema>;

export const DatabaseViewsUpdateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    viewId: zEngineId,
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10000).nullish(),
    filter: zFilter.nullish(),
    sort: zSort.nullish(),
    group: zGroup.nullish(),
    columnMeta: z.record(zEngineId, zColumnMeta).optional(),
    options: zViewOptionsPatch.optional(),
    overrides: zViewOverridesPatch.optional(),
    isLocked: z.boolean().optional(),
    origin: zOrigin,
  }),
});

export type DatabaseViewsUpdateReq = z.infer<typeof DatabaseViewsUpdateSchema>;

export const DatabaseViewsDeleteSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    viewId: zEngineId,
    origin: zOrigin,
  }),
});

export type DatabaseViewsDeleteReq = z.infer<typeof DatabaseViewsDeleteSchema>;

export const DatabaseViewsDuplicateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    viewId: zEngineId,
    origin: zOrigin,
  }),
});

export type DatabaseViewsDuplicateReq = z.infer<
  typeof DatabaseViewsDuplicateSchema
>;

export const DatabaseViewsReorderSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    viewId: zEngineId,
    anchorId: zEngineId,
    position: zPosition,
    origin: zOrigin,
  }),
});

export type DatabaseViewsReorderReq = z.infer<
  typeof DatabaseViewsReorderSchema
>;

// teableHooks.*

const zTeableObject = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  avatarUrl: z.string().nullish(),
  name: z.string().optional(),
  path: z.string().optional(),
  token: z.string().optional(),
  size: z.number().optional(),
  mimetype: z.string().optional(),
  presignedUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  smThumbnailUrl: z.string().optional(),
  lgThumbnailUrl: z.string().optional(),
});

const zTeableCell = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    zTeableObject,
    z.array(z.union([z.string(), z.number(), z.boolean(), zTeableObject])),
  ])
  .optional()
  .catch(null);

const zHookChange = z.object({
  recordId: z.string().max(64),
  fieldId: z.string().max(64),
  before: zTeableCell,
  after: zTeableCell,
});

export const TeableHooksReceiveSchema = BaseSchema.extend({
  body: z.object({
    tableId: zEngineId,
    events: z
      .array(
        z.object({
          kind: z.enum([
            "record.create",
            "record.update",
            "record.delete",
            "field",
            "view",
          ]),
          recordIds: z.array(z.string().max(64)).optional(),
          fieldIds: z.array(z.string().max(64)).optional(),
          viewIds: z.array(z.string().max(64)).optional(),
          changes: z.array(zHookChange).optional(),
        })
      )
      .max(10000),
    actor: z
      .object({ id: z.string().max(64), email: z.string().max(255).nullish() })
      .nullish(),
    origin: z.string().max(255).nullish(),
  }),
});

export type TeableHooksReceiveReq = z.infer<typeof TeableHooksReceiveSchema>;

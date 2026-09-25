import { z } from "zod";
import type {
  DatabaseAutomationAction,
  DatabaseAutomationTrigger,
  DatabaseAutomationValue,
} from "@shared/databases/automations";
import { DatabaseAutomationLimits } from "@shared/databases/automations";
import type {
  DatabaseCellInput,
  DatabaseDateFilterMode,
  DatabaseFilter,
  DatabaseFilterItem,
} from "@shared/databases/types";
import { BaseSchema } from "@server/routes/api/schema";

/** An engine id (field, view, record): never trusted beyond its format. */
export const zEngineId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, {
  error: "must be an identifier",
});

const zUserInput = z.object({ outlineUserId: z.uuid() });

const zLinkValue = z.object({
  id: zEngineId,
  title: z.string().max(1000).optional(),
});

/** A cell value written by an automation or a form. */
export const zCellInput: z.ZodType<DatabaseCellInput> = z.union([
  z.string().max(100000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(10000)).max(1000),
  z.array(z.number()).max(1000),
  zUserInput,
  z.array(zUserInput).max(100),
  zLinkValue,
  z.array(zLinkValue).max(1000),
]);

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

const zDateFilterMode = z.custom<DatabaseDateFilterMode>(
  (value) => typeof value === "string" && /^[A-Za-z]{1,64}$/.test(value),
  { error: "must be a date filter mode" }
);

const zFilterItem: z.ZodType<DatabaseFilterItem> = z.object({
  fieldId: zEngineId,
  operator: z.enum(filterOperators),
  value: z.union([
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
  ]),
});

const zFilter: z.ZodType<DatabaseFilter> = z.lazy(() =>
  z.object({
    conjunction: z.enum(["and", "or"]),
    filterSet: z.array(z.union([zFilterItem, zFilter])).max(50),
  })
);

const zTrigger: z.ZodType<DatabaseAutomationTrigger> = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("recordCreated") }),
    z.object({
      type: z.literal("propertyChanged"),
      fieldId: zEngineId,
      to: z.array(z.string().max(1000)).max(100).optional(),
    }),
    z.object({ type: z.literal("buttonClicked"), fieldId: zEngineId }),
  ]
);

const zValue: z.ZodType<DatabaseAutomationValue> = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("static"), value: zCellInput }),
    z.object({ kind: z.literal("template"), text: z.string().max(10000) }),
    z.object({ kind: z.literal("now") }),
    z.object({ kind: z.literal("me") }),
    z.object({ kind: z.literal("clear") }),
    z.object({ kind: z.literal("record") }),
  ]
);

const zMessage = z.string().trim().max(2000);

const zAction: z.ZodType<DatabaseAutomationAction> = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("setProperty"),
      fieldId: zEngineId,
      value: zValue,
    }),
    z.object({
      type: z.literal("notify"),
      userIds: z.array(z.uuid()).max(50).optional(),
      personFieldId: zEngineId.optional(),
      message: zMessage.default(""),
    }),
    z.object({
      type: z.literal("slack"),
      webhookUrl: z.url().max(500),
      message: zMessage.default(""),
    }),
    z.object({
      type: z.literal("createRecord"),
      databaseId: z.uuid(),
      fields: z
        .record(zEngineId, zValue)
        .refine((fields) => Object.keys(fields).length <= 200, {
          error: "too many fields",
        }),
    }),
  ]
);

const zActions = z
  .array(zAction)
  .min(1)
  .max(DatabaseAutomationLimits.maxActions);

const zName = z.string().trim().max(255);

export const DatabaseAutomationsListSchema = BaseSchema.extend({
  body: z.object({ databaseId: z.uuid() }),
});

export type DatabaseAutomationsListReq = z.infer<
  typeof DatabaseAutomationsListSchema
>;

export const DatabaseAutomationsCreateSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    name: zName.default(""),
    enabled: z.boolean().default(true),
    trigger: zTrigger,
    conditions: zFilter.nullish(),
    actions: zActions,
  }),
});

export type DatabaseAutomationsCreateReq = z.infer<
  typeof DatabaseAutomationsCreateSchema
>;

export const DatabaseAutomationsUpdateSchema = BaseSchema.extend({
  body: z.object({
    id: z.uuid(),
    name: zName.optional(),
    enabled: z.boolean().optional(),
    trigger: zTrigger.optional(),
    conditions: zFilter.nullish(),
    actions: zActions.optional(),
  }),
});

export type DatabaseAutomationsUpdateReq = z.infer<
  typeof DatabaseAutomationsUpdateSchema
>;

export const DatabaseAutomationsDeleteSchema = BaseSchema.extend({
  body: z.object({ id: z.uuid() }),
});

export type DatabaseAutomationsDeleteReq = z.infer<
  typeof DatabaseAutomationsDeleteSchema
>;

export const DatabaseRecordsClickButtonSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    recordId: zEngineId,
    fieldId: zEngineId,
  }),
});

export type DatabaseRecordsClickButtonReq = z.infer<
  typeof DatabaseRecordsClickButtonSchema
>;

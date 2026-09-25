import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";
import {
  DatabaseRecordsCreateSchema,
  DatabaseRecordsDeleteSchema,
} from "./schema";

const recordsBody = DatabaseRecordsDeleteSchema.shape.body.shape;

export const DatabaseRecordsCommentCountsSchema = BaseSchema.extend({
  body: z.object({
    databaseId: recordsBody.databaseId,
    recordIds: recordsBody.recordIds.max(200),
  }),
});

export type DatabaseRecordsCommentCountsReq = z.infer<
  typeof DatabaseRecordsCommentCountsSchema
>;

export const DatabaseRecordsCreateFromTemplateSchema = BaseSchema.extend({
  body: DatabaseRecordsCreateSchema.shape.body.extend({
    templateId: z.uuid(),
  }),
});

export type DatabaseRecordsCreateFromTemplateReq = z.infer<
  typeof DatabaseRecordsCreateFromTemplateSchema
>;

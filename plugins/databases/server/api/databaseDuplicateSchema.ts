import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const DatabasesDuplicateSchema = BaseSchema.extend({
  body: z.object({
    id: z.uuid(),
    /** The page the copy is anchored on; the source's anchor when not given. */
    targetDocumentId: z.uuid().optional(),
    title: z.string().trim().min(1).max(255).optional(),
    withRecords: z.boolean().default(false),
  }),
});

export type DatabasesDuplicateReq = z.infer<typeof DatabasesDuplicateSchema>;

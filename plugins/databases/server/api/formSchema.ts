import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";
import { zCellInput, zEngineId } from "./automationSchema";

const zSlug = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, {
  error: "must be a form address",
});

/** A form by its public address, or by its view for the database's members. */
const zFormRef = {
  slug: zSlug.optional(),
  databaseId: z.uuid().optional(),
  viewId: zEngineId.optional(),
};

const hasFormRef = (body: {
  slug?: string;
  databaseId?: string;
  viewId?: string;
}) => !!body.slug || (!!body.databaseId && !!body.viewId);

export const DatabaseFormsInfoSchema = BaseSchema.extend({
  body: z.object(zFormRef).refine(hasFormRef, {
    error: "slug or databaseId and viewId are required",
  }),
});

export type DatabaseFormsInfoReq = z.infer<typeof DatabaseFormsInfoSchema>;

export const DatabaseFormsSubmitSchema = BaseSchema.extend({
  body: z
    .object({
      ...zFormRef,
      fields: z
        .record(zEngineId, zCellInput)
        .refine((fields) => Object.keys(fields).length <= 200, {
          error: "too many fields",
        })
        .default({}),
      /** The honeypot: people leave it empty. */
      website: z.string().max(1000).optional(),
    })
    .refine(hasFormRef, {
      error: "slug or databaseId and viewId are required",
    }),
});

export type DatabaseFormsSubmitReq = z.infer<typeof DatabaseFormsSubmitSchema>;

export const DatabaseFormsShareSchema = BaseSchema.extend({
  body: z.object({
    databaseId: z.uuid(),
    viewId: zEngineId,
    public: z.boolean().optional(),
    requireLogin: z.boolean().optional(),
    successMessage: z.string().trim().max(1000).nullish(),
    resetLink: z.boolean().optional(),
  }),
});

export type DatabaseFormsShareReq = z.infer<typeof DatabaseFormsShareSchema>;

import Router from "koa-router";
import { z } from "zod";
import type {
  DatabaseCellValue,
  DatabaseColumnMeta,
  DatabaseFieldOptions,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseSort,
  DatabaseViewOptions,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { UserRole } from "@shared/types";
import { ValidationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import type { APIContext } from "@server/types";
import { GatewaySpaceId, TeableGateway } from "../migration/TeableGateway";

// The Teable REST calls of the Notion migration tools, answered by the Outline engine (see TeableGateway). The tools
// take TEABLE_URL=<outline>/api/teable and an Outline admin API key as TEABLE_TOKEN.
const router = new Router();
const admin = auth({ role: UserRole.Admin });
const prefix = "teable/api";

const zOptions = z.custom<DatabaseFieldOptions>(
  (value) => typeof value === "object" && value !== null
);
const zField = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.enum(DatabaseFieldType),
  options: zOptions.optional(),
  lookupOptions: z
    .object({
      foreignTableId: z.string(),
      linkFieldId: z.string(),
      lookupFieldId: z.string(),
    })
    .optional(),
  isLookup: z.boolean().optional(),
});
const zCell = z.custom<DatabaseCellValue>(() => true);
const zRecords = z.object({
  fieldKeyType: z.enum(["name", "id"]).default("name"),
  typecast: z.boolean().default(false),
  records: z
    .array(
      z.object({
        id: z.string().optional(),
        fields: z.record(z.string(), zCell),
      })
    )
    .max(1000),
});
const zPosition = z.enum(["before", "after"]);
const zObject = <T>() =>
  z.custom<T>((value) => typeof value === "object" && value !== null);

/** Answers raw JSON: the API's own envelope would turn a list into an object. */
function send(ctx: APIContext, payload: unknown) {
  ctx.type = "application/json";
  ctx.body = Buffer.from(JSON.stringify(payload ?? {}));
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const { path, message } = result.error.issues[0];
    throw ValidationError(
      path.length ? `${String(path[path.length - 1])}: ${message}` : message
    );
  }
  return result.data;
}

const gateway = (ctx: APIContext) => new TeableGateway(ctx.state.auth.user);

router.get(`${prefix}/space/:spaceId/base`, admin, (ctx: APIContext) =>
  send(ctx, [])
);

router.post(`${prefix}/base`, admin, async (ctx: APIContext) => {
  const { name } = parse(
    z.object({ name: z.string().min(1) }),
    ctx.request.body
  );
  send(ctx, await gateway(ctx).createBase(name));
});

router.get(`${prefix}/base/:baseId`, admin, (ctx: APIContext) =>
  send(ctx, { id: ctx.params.baseId, name: "", spaceId: GatewaySpaceId })
);

router.get(`${prefix}/base/:baseId/table`, admin, async (ctx: APIContext) => {
  send(ctx, await gateway(ctx).tables(ctx.params.baseId));
});

router.post(`${prefix}/base/:baseId/table`, admin, async (ctx: APIContext) => {
  const input = parse(
    z.object({ name: z.string().min(1), fields: z.array(zField).min(1) }),
    ctx.request.body
  );
  send(ctx, await gateway(ctx).createTable(ctx.params.baseId, input));
});

router.get(`${prefix}/table/:tableId/field`, admin, async (ctx: APIContext) => {
  send(ctx, await gateway(ctx).fields(ctx.params.tableId));
});

router.post(
  `${prefix}/table/:tableId/field`,
  admin,
  async (ctx: APIContext) => {
    const input = parse(zField, ctx.request.body);
    send(ctx, await gateway(ctx).createField(ctx.params.tableId, input));
  }
);

router.patch(
  `${prefix}/table/:tableId/field/:fieldId`,
  admin,
  async (ctx: APIContext) => {
    const input = parse(
      z.object({
        name: z.string().trim().min(1).optional(),
        description: z.string().nullish(),
      }),
      ctx.request.body
    );
    const { tableId, fieldId } = ctx.params;
    send(ctx, await gateway(ctx).updateField(tableId, fieldId, input));
  }
);

router.put(
  `${prefix}/table/:tableId/field/:fieldId/convert`,
  admin,
  async (ctx: APIContext) => {
    const input = parse(
      zField.extend({ name: z.string().trim().min(1).optional() }),
      ctx.request.body
    );
    const { tableId, fieldId } = ctx.params;
    send(
      ctx,
      await gateway(ctx).convertField(tableId, fieldId, {
        ...input,
        name: input.name ?? "",
      })
    );
  }
);

router.delete(
  `${prefix}/table/:tableId/field/:fieldId`,
  admin,
  async (ctx: APIContext) => {
    await gateway(ctx).deleteField(ctx.params.tableId, ctx.params.fieldId);
    send(ctx, {});
  }
);

router.get(
  `${prefix}/table/:tableId/record`,
  admin,
  async (ctx: APIContext) => {
    const query = parse(
      z.object({
        viewId: z.string().optional(),
        ignoreViewQuery: z
          .enum(["true", "false"])
          .optional()
          .transform((value) => value === "true"),
        take: z.coerce.number().int().min(1).max(1000).default(100),
        skip: z.coerce.number().int().min(0).default(0),
      }),
      ctx.request.query
    );
    send(ctx, await gateway(ctx).records(ctx.params.tableId, query));
  }
);

router.post(
  `${prefix}/table/:tableId/record`,
  admin,
  async (ctx: APIContext) => {
    const input = parse(zRecords, ctx.request.body);
    send(ctx, await gateway(ctx).createRecords(ctx.params.tableId, input));
  }
);

router.patch(
  `${prefix}/table/:tableId/record`,
  admin,
  async (ctx: APIContext) => {
    const input = parse(
      zRecords.extend({ fieldKeyType: z.enum(["name", "id"]).default("id") }),
      ctx.request.body
    );
    send(ctx, await gateway(ctx).updateRecords(ctx.params.tableId, input));
  }
);

router.post(
  `${prefix}/table/:tableId/record/:recordId/:fieldId/uploadAttachment`,
  admin,
  async (ctx: APIContext) => {
    const { fileUrl } = parse(z.object({ fileUrl: z.url() }), ctx.request.body);
    const { tableId, recordId, fieldId } = ctx.params;
    send(
      ctx,
      await gateway(ctx).uploadAttachment(tableId, recordId, fieldId, fileUrl)
    );
  }
);

router.get(`${prefix}/table/:tableId/view`, admin, async (ctx: APIContext) => {
  send(ctx, await gateway(ctx).views(ctx.params.tableId));
});

router.post(`${prefix}/table/:tableId/view`, admin, async (ctx: APIContext) => {
  const input = parse(
    z.object({
      name: z.string().trim().min(1),
      type: z.enum(["grid", "kanban", "calendar", "gallery", "form"]),
      options: zObject<DatabaseViewOptions>().optional(),
      columnMeta:
        zObject<Record<string, Partial<DatabaseColumnMeta>>>().optional(),
      filter: zObject<DatabaseFilter>().nullish(),
      sort: zObject<DatabaseSort>().nullish(),
      group: z.array(zObject<DatabaseGroup[number]>()).nullish(),
    }),
    ctx.request.body
  );
  send(ctx, await gateway(ctx).createView(ctx.params.tableId, input));
});

const viewPath = `${prefix}/table/:tableId/view/:viewId`;

router.patch(`${viewPath}/options`, admin, async (ctx: APIContext) => {
  const { options } = parse(
    z.object({ options: zObject<DatabaseViewOptions>() }),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  send(ctx, await gateway(ctx).updateView(tableId, viewId, { options }));
});

router.put(`${viewPath}/column-meta`, admin, async (ctx: APIContext) => {
  const items = parse(
    z.array(
      z.object({
        fieldId: z.string(),
        columnMeta: zObject<Partial<DatabaseColumnMeta>>(),
      })
    ),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  const columnMeta = Object.fromEntries(
    items.map((item) => [item.fieldId, item.columnMeta])
  );
  send(ctx, await gateway(ctx).updateView(tableId, viewId, { columnMeta }));
});

router.put(`${viewPath}/filter`, admin, async (ctx: APIContext) => {
  const { filter } = parse(
    z.object({ filter: zObject<DatabaseFilter>().nullable() }),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  send(ctx, await gateway(ctx).updateView(tableId, viewId, { filter }));
});

router.put(`${viewPath}/sort`, admin, async (ctx: APIContext) => {
  const { sort } = parse(
    z.object({ sort: zObject<DatabaseSort>().nullable() }),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  send(ctx, await gateway(ctx).updateView(tableId, viewId, { sort }));
});

router.put(`${viewPath}/group`, admin, async (ctx: APIContext) => {
  const { group } = parse(
    z.object({ group: z.array(zObject<DatabaseGroup[number]>()).nullable() }),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  send(ctx, await gateway(ctx).updateView(tableId, viewId, { group }));
});

router.put(`${viewPath}/name`, admin, async (ctx: APIContext) => {
  const { name } = parse(
    z.object({ name: z.string().trim().min(1) }),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  send(ctx, await gateway(ctx).updateView(tableId, viewId, { name }));
});

router.put(`${viewPath}/order`, admin, async (ctx: APIContext) => {
  const { anchorId, position } = parse(
    z.object({ anchorId: z.string(), position: zPosition }),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  await gateway(ctx).reorderView(tableId, viewId, anchorId, position);
  send(ctx, {});
});

router.put(`${viewPath}/record-order`, admin, async (ctx: APIContext) => {
  const input = parse(
    z.object({
      anchorId: z.string(),
      position: zPosition,
      recordIds: z.array(z.string()).min(1).max(1000),
    }),
    ctx.request.body
  );
  const { tableId, viewId } = ctx.params;
  await gateway(ctx).orderRecords(tableId, viewId, input);
  send(ctx, {});
});

router.post(
  `${prefix}/galadrim/users/ensure`,
  admin,
  async (ctx: APIContext) => {
    const { users } = parse(
      z.object({
        users: z
          .array(z.object({ email: z.email(), name: z.string().default("") }))
          .max(1000),
      }),
      ctx.request.body
    );
    send(ctx, await gateway(ctx).ensureUsers(users));
  }
);

router.post(`${prefix}/galadrim/space`, admin, (ctx: APIContext) =>
  send(ctx, { spaceId: GatewaySpaceId })
);

export default router;

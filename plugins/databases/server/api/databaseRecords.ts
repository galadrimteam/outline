import Router from "koa-router";
import type { DatabaseCellValue } from "@shared/databases/types";
import { databaseRowDocumentCreator } from "@server/commands/databaseRowDocumentCreator";
import env from "@server/env";
import auth from "@server/middlewares/authentication";
import multipart from "@server/middlewares/multipart";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { ValidationError } from "@server/errors";
import type { Database } from "@server/models";
import { Document } from "@server/models";
import { authorize, can } from "@server/policies";
import { presentDocument, presentPolicies } from "@server/presenters";
import type { APIContext } from "@server/types";
import { databaseRecordsDeleter } from "../commands/databaseRecordsDeleter";
import type { DatabaseActor, DatabaseEngine } from "../engine/DatabaseEngine";
import { engineFor, refFor } from "../engine";
import {
  presentDatabaseRecord,
  presentDatabaseRecords,
} from "../presenters/databaseRecords";
import { actorFor } from "../utils/actor";
import { cellText } from "../utils/cellText";
import { DatabaseRowIcons } from "../utils/DatabaseRowIcons";
import { DatabaseUserMapper } from "../utils/DatabaseUserMapper";
import {
  loadDatabaseForRead,
  redactGroupPointsForShare,
  redactRecordsForShare,
  rowPageAuthorFor,
} from "../utils/shareAccess";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
} from "../utils/routeHelpers";
import * as T from "./schema";

const router = new Router();

router.post(
  "databaseRecords.list",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseRecordsListSchema),
  async (ctx: APIContext<T.DatabaseRecordsListReq>) => {
    const {
      databaseId,
      viewId,
      filter,
      replaceFilter,
      sort,
      search,
      offset,
      limit,
      shareId,
    } = ctx.input.body;
    const access = await loadDatabaseForRead(ctx, databaseId, shareId);
    const { database, user } = access;

    const page = await engineFor(database).listRecords(
      access.actor,
      refFor(database),
      {
        viewId,
        filter,
        replaceFilter:
          replaceFilter &&
          !access.shareId &&
          !!user &&
          can(user, "update", database) === true,
        sort,
        search,
        skip: offset,
        take: limit,
      }
    );

    ctx.body = {
      pagination: { offset, limit, total: page.total },
      data: redactRecordsForShare(
        access,
        await presentDatabaseRecords(database, page.records, access.actor)
      ),
    };
  }
);

router.post(
  "databaseRecords.info",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseRecordsInfoSchema),
  async (ctx: APIContext<T.DatabaseRecordsInfoReq>) => {
    const { databaseId, recordId, shareId } = ctx.input.body;
    const access = await loadDatabaseForRead(ctx, databaseId, shareId);
    const { database } = access;

    const record = await engineFor(database).getRecord(
      access.actor,
      refFor(database),
      recordId
    );

    const [presented] = redactRecordsForShare(access, [
      await presentDatabaseRecord(database, record, access.actor),
    ]);
    ctx.body = { data: presented };
  }
);

router.post(
  "databaseRecords.create",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsCreateSchema),
  async (ctx: APIContext<T.DatabaseRecordsCreateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, fields, order, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");
    const engine = engineFor(database, { origin });
    const actor = actorFor(user);

    const record = await engine.createRecord(actor, refFor(database), {
      fields: await DatabaseUserMapper.resolveInputs(
        engine,
        database.teamId,
        fields
      ),
      order,
    });

    ctx.body = { data: await presentDatabaseRecord(database, record, actor) };
  }
);

router.post(
  "databaseRecords.update",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsUpdateSchema),
  async (ctx: APIContext<T.DatabaseRecordsUpdateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, recordId, fields, order, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");
    const engine = engineFor(database, { origin });
    const actor = actorFor(user);

    const record = await engine.updateRecord(
      actor,
      refFor(database),
      recordId,
      {
        fields: await DatabaseUserMapper.resolveInputs(
          engine,
          database.teamId,
          fields
        ),
        order,
      }
    );

    ctx.body = { data: await presentDatabaseRecord(database, record, actor) };
  }
);

router.post(
  "databaseRecords.move",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsMoveSchema),
  async (ctx: APIContext<T.DatabaseRecordsMoveReq>) => {
    const user = authenticatedUser(ctx);
    const {
      databaseId,
      viewId,
      recordIds,
      anchorId,
      position,
      fields,
      origin,
    } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");
    const engine = engineFor(database, { origin });
    const actor = actorFor(user);

    const records = await engine.moveRecords(actor, refFor(database), {
      viewId,
      recordIds,
      anchorId,
      position,
      fields: fields
        ? await DatabaseUserMapper.resolveInputs(
            engine,
            database.teamId,
            fields
          )
        : undefined,
    });

    ctx.body = {
      data: await presentDatabaseRecords(database, records, actor),
    };
  }
);

router.post(
  "databaseRecords.delete",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsDeleteSchema),
  async (ctx: APIContext<T.DatabaseRecordsDeleteReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, recordIds, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    await databaseRecordsDeleter(ctx.context, {
      database,
      engine: engineFor(database, { origin }),
      recordIds,
    });

    ctx.body = { success: true };
  }
);

router.post(
  "databaseRecords.duplicate",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsDuplicateSchema),
  async (ctx: APIContext<T.DatabaseRecordsDuplicateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, recordId, order, origin } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");
    const actor = actorFor(user);

    const record = await engineFor(database, { origin }).duplicateRecord(
      actor,
      refFor(database),
      recordId,
      order
    );

    ctx.body = { data: await presentDatabaseRecord(database, record, actor) };
  }
);

router.post(
  "databaseRecords.open",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsOpenSchema),
  async (ctx: APIContext<T.DatabaseRecordsOpenReq>) => {
    const { databaseId, recordId, shareId } = ctx.input.body;
    const access = await loadDatabaseForRead(ctx, databaseId, shareId);
    const { database, user } = access;

    const existing = await Document.unscoped().findOne({
      attributes: ["id"],
      where: { databaseId, databaseRecordId: recordId },
    });
    const document = existing
      ? await Document.findByPk(existing.id, {
          userId: user?.id,
          rejectOnEmpty: true,
        })
      : await databaseRowDocumentCreator(
          access.shareId
            ? { user: await rowPageAuthorFor(access) }
            : ctx.context,
          {
            database,
            recordId,
            ...(await rowTitle(
              engineFor(database),
              database,
              access.actor,
              recordId
            )),
          }
        );

    if (access.shareId || !user) {
      ctx.body = {
        data: await presentDocument(ctx, document, {
          isPublic: true,
          shareId: access.shareId ?? undefined,
        }),
      };
      return;
    }
    authorize(user, "read", document);

    ctx.body = {
      data: await presentDocument(ctx, document),
      policies: presentPolicies(user, [document]),
    };
  }
);

router.post(
  "databaseRecords.groups",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseRecordsGroupsSchema),
  async (ctx: APIContext<T.DatabaseRecordsGroupsReq>) => {
    const { databaseId, viewId, groupBy, filter, search, shareId } =
      ctx.input.body;
    const access = await loadDatabaseForRead(ctx, databaseId, shareId);
    const { database } = access;

    const engine = engineFor(database);
    const points = await engine.groupPoints(access.actor, refFor(database), {
      viewId,
      groupBy,
      filter,
      search,
    });
    const headers = points.flatMap((point) =>
      point.type === "header" ? [point] : []
    );
    await Promise.all([
      DatabaseUserMapper.enrichValues(
        database.teamId,
        headers.flatMap((header) =>
          DatabaseUserMapper.userValuesIn(header.value)
        )
      ),
      headers.some((header) => DatabaseRowIcons.mayBeLink(header.value))
        ? engine
            .getSchema(access.actor, refFor(database))
            .then(({ fields, views }) =>
              DatabaseRowIcons.enrichGroupHeaders(
                database.teamId,
                fields,
                groupBy ?? views.find((view) => view.id === viewId)?.group,
                headers
              )
            )
        : undefined,
    ]);

    ctx.body = { data: redactGroupPointsForShare(access, points) };
  }
);

router.post(
  "databaseRecords.aggregate",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseRecordsAggregateSchema),
  async (ctx: APIContext<T.DatabaseRecordsAggregateReq>) => {
    const { databaseId, viewId, fieldStats, filter, search, shareId } =
      ctx.input.body;
    const access = await loadDatabaseForRead(ctx, databaseId, shareId);
    const { database } = access;

    const data = Object.keys(fieldStats).length
      ? await engineFor(database).aggregate(access.actor, refFor(database), {
          viewId,
          fieldStats,
          filter,
          search,
        })
      : {};

    ctx.body = { data };
  }
);

router.post(
  "databaseRecords.linkCandidates",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseRecordsLinkCandidatesSchema),
  async (ctx: APIContext<T.DatabaseRecordsLinkCandidatesReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, fieldId, recordId, search, offset, limit } =
      ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const candidates = await engineFor(database).linkCandidates(
      actorFor(user),
      refFor(database),
      { fieldId, recordId, search, skip: offset, take: limit }
    );

    ctx.body = { pagination: { offset, limit }, data: candidates };
  }
);

router.post(
  "databaseRecords.history",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseRecordsHistorySchema),
  async (ctx: APIContext<T.DatabaseRecordsHistoryReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, recordId, cursor } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "read");

    const page = await engineFor(database).recordHistory(
      actorFor(user),
      refFor(database),
      recordId,
      cursor
    );
    await DatabaseUserMapper.enrichValues(
      database.teamId,
      page.entries.flatMap((entry) => [
        ...(entry.createdBy ? [entry.createdBy] : []),
        ...DatabaseUserMapper.userValuesIn(entry.before),
        ...DatabaseUserMapper.userValuesIn(entry.after),
      ])
    );

    ctx.body = {
      pagination: { nextCursor: page.nextCursor },
      data: page.entries,
    };
  }
);

router.post(
  "databaseRecords.upload",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  multipart({ maximumFileSize: env.FILE_STORAGE_UPLOAD_MAX_SIZE }),
  validate(T.DatabaseRecordsUploadSchema),
  async (ctx: APIContext<T.DatabaseRecordsUploadReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, recordId, fieldId, origin } = ctx.input.body;
    const { file } = ctx.input;
    if (!file) {
      throw ValidationError("A file is required");
    }
    const database = await loadDatabase(user, databaseId, "update");
    const actor = actorFor(user);

    const record = await engineFor(database, { origin }).uploadAttachment(
      actor,
      refFor(database),
      {
        recordId,
        fieldId,
        filePath: file.filepath,
        fileName: file.originalFilename ?? file.newFilename,
        mimeType: file.mimetype ?? "application/octet-stream",
      }
    );

    ctx.body = { data: await presentDatabaseRecord(database, record, actor) };
  }
);

/** The title and icon a row's page starts with. */
async function rowTitle(
  engine: DatabaseEngine,
  database: Database,
  actor: DatabaseActor,
  recordId: string
): Promise<{ title: string; icon: string | null }> {
  const ref = refFor(database);
  const [schema, record] = await Promise.all([
    engine.getSchema(actor, ref),
    engine.getRecord(actor, ref, recordId),
  ]);
  const primary = schema.fields.find((field) => field.isPrimary);
  const iconFieldId = database.settings?.iconFieldId;
  const icon: DatabaseCellValue | undefined = iconFieldId
    ? record.fields[iconFieldId]
    : undefined;
  return {
    title: primary ? cellText(record.fields[primary.id]) : "",
    icon: typeof icon === "string" && icon ? icon : null,
  };
}

export default router;

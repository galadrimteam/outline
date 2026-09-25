import { Op } from "sequelize";
import type { WhereOptions } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroup,
  DatabaseRecord,
  DatabaseRecordPosition,
  DatabaseViewOptions,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import AuthenticationHelper from "@shared/helpers/AuthenticationHelper";
import { TextEditMode } from "@shared/types";
import { databaseRowDocumentCreator } from "@server/commands/databaseRowDocumentCreator";
import documentUpdater from "@server/commands/documentUpdater";
import { commentParser } from "@server/editor";
import { ValidationError } from "@server/errors";
import type { User } from "@server/models";
import { Collection, Comment, Database, Document } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { authorize, can } from "@server/policies";
import { sequelize } from "@server/storage/database";
import { QueryHelper } from "@server/storage/QueryHelper";
import type { APIContext } from "@server/types";
import { engineFor, refFor } from "plugins/databases/server/engine";
import type {
  DatabaseEngine,
  DatabaseRef,
  DatabaseUserActor,
} from "plugins/databases/server/engine/DatabaseEngine";
import databasesEnv from "plugins/databases/server/env";
import { presentDatabaseRecords } from "plugins/databases/server/presenters/databaseRecords";
import { actorFor } from "plugins/databases/server/utils/actor";
import { cellText } from "plugins/databases/server/utils/cellText";
import { DatabaseSettingsHelper } from "plugins/databases/server/utils/DatabaseSettingsHelper";
import { DatabaseUserMapper } from "plugins/databases/server/utils/DatabaseUserMapper";
import {
  isOverlayLayout,
  viewTypeForLayout,
} from "plugins/databases/server/utils/layouts";
import {
  loadDatabase,
  updateDatabaseSettings,
} from "plugins/databases/server/utils/routeHelpers";
import type { PropertyInput } from "./databaseInputs";
import {
  DatabaseInputTranslator,
  DatabaseSchemaIndex,
  filterOperatorNames,
} from "./databaseInputs";
import type { PresentedDatabaseRecord } from "./databaseOutputs";
import { presentProperty, presentRecord, presentView } from "./databaseOutputs";
import { EngineLinkResolver, TeamPeopleResolver } from "./databaseResolvers";
import {
  buildAPIContext,
  error,
  getActorFromContext,
  optionalString,
  success,
  withTracing,
} from "./util";

/**
 * Registers the tools that read and write databases (tables and boards of
 * rows, each row having its own page), filtered by the OAuth scopes granted
 * to the current token. Nothing is registered when databases are not
 * configured on this server.
 *
 * @param server - the MCP server instance to register tools on.
 * @param scopes - the OAuth scopes granted to the access token.
 */
export function databaseTools(server: McpServer, scopes: string[]) {
  if (!databasesEnv.TEABLE_INTERNAL_URL || !databasesEnv.GALADRIM_SECRET) {
    return;
  }

  if (AuthenticationHelper.canAccess("databases.list", scopes)) {
    server.registerTool(
      "list_databases",
      {
        title: "List databases",
        description:
          "Lists the databases (Notion-like tables and kanban boards whose rows each have a page) the user can read. Optionally search by the title of the database or of the document it lives in, or filter by collection. Use get_database_schema next to learn its properties and views.",
        annotations: { idempotentHint: true, readOnlyHint: true },
        inputSchema: {
          query: optionalString().describe(
            "Text searched in the database title and in the title of the document holding it."
          ),
          collectionId: optionalString().describe(
            "A collection ID to list the databases of."
          ),
          offset: z.coerce
            .number()
            .int()
            .min(0)
            .optional()
            .describe("The pagination offset. Defaults to 0."),
          limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe(
              "The maximum number of results to return. Defaults to 25, max 100."
            ),
        },
      },
      withTracing(
        "list_databases",
        async ({ query, collectionId, offset, limit }, extra) => {
          try {
            const user = getActorFromContext(extra);
            const databases = await listReadableDatabases(user, {
              query,
              collectionId,
              offset: offset ?? 0,
              limit: limit ?? 25,
            });
            return success(
              databases.map((database) =>
                presentDatabaseSummary(user, database)
              )
            );
          } catch (err) {
            return error(err);
          }
        }
      )
    );
  }

  if (AuthenticationHelper.canAccess("databases.info", scopes)) {
    server.registerTool(
      "get_database_schema",
      {
        title: "Get database schema",
        description:
          "Returns the properties of a database (name, type, select options, status groups, relations) and its views (name, layout such as table or board, the property a board is split into columns by, filter and sort). Property and view names are what the other database tools take.",
        annotations: { idempotentHint: true, readOnlyHint: true },
        inputSchema: { databaseId: zDatabaseId },
      },
      withTracing("get_database_schema", async ({ databaseId }, extra) => {
        try {
          const session = await DatabaseSession.open(
            getActorFromContext(extra),
            databaseId,
            "read"
          );
          return success({
            ...session.summary(),
            properties: session.index.fields.map((field) =>
              presentProperty(session.index, field)
            ),
            views: session.index.views.map((view) =>
              presentView(session.index, view)
            ),
          });
        } catch (err) {
          return error(err);
        }
      })
    );
  }

  if (AuthenticationHelper.canAccess("databaseRecords.list", scopes)) {
    server.registerTool(
      "query_database_records",
      {
        title: "Query database rows",
        description: `Lists the rows (cards) of a database, with their properties keyed by property name and the URL of each row's page. Filter by property name, e.g. [{"property":"Status","operator":"is","value":"To test"}]; select options, people and dates are written as people read them. Without a view every row is searched; with a view, its own filter and order apply too. Empty properties are left out of each row. Results are paginated: pass nextCursor back as cursor for the next page.`,
        annotations: { idempotentHint: true, readOnlyHint: true },
        inputSchema: {
          databaseId: zDatabaseId,
          view: optionalString().describe(
            "A view name or ID: its filter and order apply on top of yours."
          ),
          filter: zFilter
            .optional()
            .describe(
              'Conditions on properties, combined with conjunction. An item may also be a group {"conjunction":"or","conditions":[…]}.'
            ),
          // Models often pluralize the key; silently dropping it would return unfiltered rows.
          filters: zFilter.optional().describe("Same as filter."),
          conjunction: z
            .enum(["and", "or"])
            .optional()
            .describe(
              "How the top-level filter items combine. Defaults to and."
            ),
          sort: zSort.optional(),
          search: optionalString().describe(
            "Text searched in every property of the rows."
          ),
          limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe(
              "The maximum number of rows to return. Defaults to 25, max 100."
            ),
          cursor: optionalString().describe(
            "The nextCursor of a previous call, to read the next page."
          ),
        },
      },
      withTracing("query_database_records", async (input, extra) => {
        try {
          const session = await DatabaseSession.open(
            getActorFromContext(extra),
            input.databaseId,
            "read"
          );
          const view = input.view
            ? session.index.view(input.view)
            : session.index.defaultView();
          const offset = parseCursor(input.cursor);
          const limit = input.limit ?? 25;

          const page = await session.engine.listRecords(
            session.actor,
            session.ref,
            {
              viewId: view?.id,
              // Without a view named, the first view only gives the order.
              replaceFilter: !input.view,
              filter: await session.inputs.filter(
                input.filter ?? input.filters,
                input.conjunction
              ),
              sort: session.inputs.sort(input.sort),
              search: input.search,
              skip: offset,
              take: limit,
            }
          );
          const next = offset + page.records.length;

          return success({
            database: session.summary(),
            ...(input.view && view ? { view: view.name } : {}),
            total: page.total,
            records: await session.presentRecords(page.records),
            ...(next < page.total && page.records.length
              ? { nextCursor: String(next) }
              : {}),
          });
        } catch (err) {
          return error(err);
        }
      })
    );
  }

  if (AuthenticationHelper.canAccess("databaseRecords.info", scopes)) {
    server.registerTool(
      "get_database_record",
      {
        title: "Get database row",
        description:
          "Returns one row of a database with its properties keyed by property name, and the markdown of the row's page when it has one (its description, notes and checklists).",
        annotations: { idempotentHint: true, readOnlyHint: true },
        inputSchema: { databaseId: zDatabaseId, recordId: zRecordId },
      },
      withTracing(
        "get_database_record",
        async ({ databaseId, recordId }, extra) => {
          try {
            const user = getActorFromContext(extra);
            const session = await DatabaseSession.open(
              user,
              databaseId,
              "read"
            );
            const id = parseRecordId(recordId);
            const record = await session.engine.getRecord(
              session.actor,
              session.ref,
              id
            );
            const [presented] = await session.presentRecords([record]);
            const page = presented.pageId
              ? await Document.findByPk(presented.pageId, { userId: user.id })
              : null;

            return success({
              database: session.summary(),
              record: presented,
              ...(page && can(user, "read", page)
                ? {
                    page: {
                      id: page.id,
                      text: await DocumentHelper.toMarkdown(page, {
                        includeTitle: false,
                      }),
                    },
                  }
                : {}),
            });
          } catch (err) {
            return error(err);
          }
        }
      )
    );
  }

  if (AuthenticationHelper.canAccess("databaseRecords.create", scopes)) {
    server.registerTool(
      "create_database_record",
      {
        title: "Create database row",
        description:
          'Creates a row (a card) in a database. Properties are keyed by property name; write select options by name, people by e-mail (or name, or "me"), dates as YYYY-MM-DD or ISO 8601, relations by row title or id, checkboxes as true/false. Optionally give the markdown body of the row\'s page. Returns the row.',
        annotations: { idempotentHint: false, readOnlyHint: false },
        inputSchema: {
          databaseId: zDatabaseId,
          properties: zProperties,
          content: optionalString().describe(
            "Markdown written as the body of the row's page (no top-level heading)."
          ),
        },
      },
      withTracing("create_database_record", async (input, context) => {
        try {
          const ctx = buildAPIContext(context);
          const session = await DatabaseSession.open(
            ctx.state.auth.user,
            input.databaseId,
            "update"
          );
          const record = await session.engine.createRecord(
            session.actor,
            session.ref,
            { fields: await session.cells(input.properties) }
          );
          if (input.content) {
            await writeRowPage(ctx, session, record, input.content);
          }
          const [presented] = await session.presentRecords([record]);
          return success(presented);
        } catch (err) {
          return error(err);
        }
      })
    );
  }

  if (AuthenticationHelper.canAccess("databaseRecords.update", scopes)) {
    server.registerTool(
      "update_database_record",
      {
        title: "Update database row",
        description:
          'Changes properties of a row of a database; the properties not given are kept. Properties are keyed by property name, with values written as for create_database_record (null or "" empties a property). Optionally replace the markdown body of the row\'s page. To move a card to another column of a board and place it, prefer move_card.',
        annotations: { idempotentHint: true, readOnlyHint: false },
        inputSchema: {
          databaseId: zDatabaseId,
          recordId: zRecordId,
          properties: zProperties.optional(),
          content: optionalString().describe(
            "Markdown that replaces the body of the row's page (no top-level heading)."
          ),
        },
      },
      withTracing("update_database_record", async (input, context) => {
        try {
          const ctx = buildAPIContext(context);
          const session = await DatabaseSession.open(
            ctx.state.auth.user,
            input.databaseId,
            "update"
          );
          const id = parseRecordId(input.recordId);
          const hasProperties =
            !!input.properties && Object.keys(input.properties).length > 0;
          if (!hasProperties && !input.content) {
            throw ValidationError("Give properties or content to update");
          }
          const record = hasProperties
            ? await session.engine.updateRecord(
                session.actor,
                session.ref,
                id,
                { fields: await session.cells(input.properties ?? {}) }
              )
            : await session.engine.getRecord(session.actor, session.ref, id);
          if (input.content) {
            await writeRowPage(ctx, session, record, input.content);
          }
          const [presented] = await session.presentRecords([record]);
          return success(presented);
        } catch (err) {
          return error(err);
        }
      })
    );
  }

  if (AuthenticationHelper.canAccess("databaseRecords.move", scopes)) {
    server.registerTool(
      "move_card",
      {
        title: "Move card",
        description:
          "Moves a card of a board to another column and/or places it just before or after another card, as dragging it does. The column is a value of the property the board is split by (usually a status), written by name. Without view, the first board of the database is used. Returns the moved card.",
        annotations: { idempotentHint: true, readOnlyHint: false },
        inputSchema: {
          databaseId: zDatabaseId,
          recordId: zRecordId,
          column: z
            .union([z.string(), z.null()])
            .optional()
            .describe(
              'The column to move the card to, e.g. a status name, or a person\'s e-mail on a board split by person. null or "" is the column of cards without value.'
            ),
          before: optionalString().describe(
            "A card ID: the card is placed just above it."
          ),
          after: optionalString().describe(
            "A card ID: the card is placed just below it."
          ),
          view: optionalString().describe(
            "The board (view name or ID) the order applies to."
          ),
          property: optionalString().describe(
            "The property the column is written to, when the view is not split by one."
          ),
        },
      },
      withTracing("move_card", async (input, extra) => {
        try {
          const session = await DatabaseSession.open(
            getActorFromContext(extra),
            input.databaseId,
            "update"
          );
          const id = parseRecordId(input.recordId);
          const view = input.view
            ? session.index.view(input.view)
            : (session.index.boardView() ?? session.index.defaultView());
          if (!view) {
            throw ValidationError("This database has no view to move cards in");
          }
          if (input.before && input.after) {
            throw ValidationError("Give before or after, not both");
          }
          const anchor = input.before ?? input.after;
          const position: DatabaseRecordPosition | undefined = input.before
            ? "before"
            : input.after
              ? "after"
              : undefined;

          let fields: Record<string, DatabaseCellValue> | undefined;
          if (input.column !== undefined) {
            const field = input.property
              ? session.index.field(input.property)
              : session.index.groupingField(view);
            if (!field) {
              throw ValidationError(
                `The view "${view.name}" is not split into columns: name the property to set`
              );
            }
            fields = await session.cells({ [field.id]: input.column });
          }
          if (!fields && !anchor) {
            throw ValidationError("Give a column, or a card to move next to");
          }

          const records = await session.engine.moveRecords(
            session.actor,
            session.ref,
            {
              viewId: view.id,
              recordIds: [id],
              anchorId: anchor ? parseRecordId(anchor) : undefined,
              position,
              fields,
            }
          );
          const [presented] = await session.presentRecords(records);
          return success(presented);
        } catch (err) {
          return error(err);
        }
      })
    );
  }

  if (
    AuthenticationHelper.canAccess("comments.create", scopes) &&
    AuthenticationHelper.canAccess("databaseRecords.info", scopes)
  ) {
    server.registerTool(
      "comment_database_record",
      {
        title: "Comment on database row",
        description:
          "Adds a comment to a row of a database, on the row's page (created if the row never had one). Use list_comments with the returned documentId to read the discussion.",
        annotations: { idempotentHint: false, readOnlyHint: false },
        inputSchema: {
          databaseId: zDatabaseId,
          recordId: zRecordId,
          text: z.string().min(1).describe("The markdown text of the comment."),
        },
      },
      withTracing("comment_database_record", async (input, context) => {
        try {
          const ctx = buildAPIContext(context);
          const { user } = ctx.state.auth;
          const session = await DatabaseSession.open(
            user,
            input.databaseId,
            "read"
          );
          const id = parseRecordId(input.recordId);
          const page = await openRowPage(ctx, session, id);

          const comment = await sequelize.transaction(async (transaction) => {
            ctx.state.transaction = transaction;
            ctx.context.transaction = transaction;
            const document = await Document.findByPk(page.id, {
              userId: user.id,
              transaction,
            });
            authorize(user, "comment", document);
            return Comment.createWithCtx(ctx, {
              id: uuidv4(),
              data: commentParser.parse(input.text).toJSON(),
              createdById: user.id,
              documentId: document.id,
            });
          });

          return success({
            success: true,
            id: comment.id,
            documentId: page.id,
            url: session.recordUrl(id),
          });
        } catch (err) {
          return error(err);
        }
      })
    );
  }

  if (AuthenticationHelper.canAccess("databaseViews.create", scopes)) {
    server.registerTool(
      "create_database_view",
      {
        title: "Create database view",
        description:
          "Adds a view to a database: a table, a board split into columns by a property, a calendar, a gallery, a list or a timeline, with an optional filter and sort written with property names (as in query_database_records). Returns the view.",
        annotations: { idempotentHint: false, readOnlyHint: false },
        inputSchema: {
          databaseId: zDatabaseId,
          name: z.string().trim().min(1).max(255).describe("The view name."),
          layout: z.enum(viewLayouts).describe("How the view shows the rows."),
          groupBy: optionalString().describe(
            "The property a board is split into columns by (defaults to the first select), or that other views group rows by."
          ),
          filter: zFilter.optional(),
          conjunction: z
            .enum(["and", "or"])
            .optional()
            .describe(
              "How the top-level filter items combine. Defaults to and."
            ),
          sort: zSort.optional(),
        },
      },
      withTracing("create_database_view", async (input, extra) => {
        try {
          const session = await DatabaseSession.open(
            getActorFromContext(extra),
            input.databaseId,
            "update"
          );
          const { index, engine, actor, ref, database } = session;
          const isBoard = input.layout === DatabaseLayout.Board;
          const groupField = input.groupBy
            ? index.field(input.groupBy)
            : undefined;
          const filter = await session.inputs.filter(
            input.filter,
            input.conjunction
          );
          const sort = session.inputs.sort(input.sort);

          const options: DatabaseViewOptions = {};
          if (isBoard) {
            options.stackFieldId = (groupField ?? defaultStackField(index))?.id;
          }
          let view = await engine.createView(actor, ref, {
            name: input.name,
            type: viewTypeForLayout(input.layout),
            options: options.stackFieldId ? options : undefined,
          });
          if (isOverlayLayout(input.layout)) {
            const layout = input.layout;
            await updateDatabaseSettings(database, (settings) =>
              DatabaseSettingsHelper.mergeViewOverrides(settings, view.id, {
                layout,
              })
            );
          }
          const group: DatabaseGroup | undefined =
            groupField && !isBoard
              ? [{ fieldId: groupField.id, order: "asc" }]
              : undefined;
          if (filter || sort || group) {
            view = await engine.updateView(actor, ref, view.id, {
              filter: filter ?? undefined,
              sort: sort ?? undefined,
              group,
            });
          }

          return success(
            presentView(
              index,
              DatabaseSettingsHelper.applyToView(view, database.settings)
            )
          );
        } catch (err) {
          return error(err);
        }
      })
    );
  }
}

/**
 * A database opened for one tool call: the database checked against the
 * user's rights, its engine acting as the user, and its schema by name.
 */
class DatabaseSession {
  /**
   * Loads a database and checks that the user may act on it.
   *
   * @param user the acting user.
   * @param databaseId the database id, or a URL containing it.
   * @param action the ability required: read for queries, update for writes.
   * @returns the session.
   * @throws NotFoundError when the database does not exist.
   * @throws AuthorizationError when the user lacks the ability.
   */
  public static async open(
    user: User,
    databaseId: string,
    action: "read" | "update"
  ): Promise<DatabaseSession> {
    const database = await loadDatabase(
      user,
      parseDatabaseId(databaseId),
      action
    );
    const engine = engineFor(database, { origin: mcpOrigin });
    const actor = actorFor(user);
    const ref = refFor(database);
    const schema = DatabaseSettingsHelper.applyToSchema(
      await engine.getSchema(actor, ref),
      database.settings
    );
    return new DatabaseSession(
      user,
      database,
      engine,
      actor,
      ref,
      new DatabaseSchemaIndex(schema)
    );
  }

  public readonly inputs: DatabaseInputTranslator;

  private constructor(
    public readonly user: User,
    public readonly database: Database,
    public readonly engine: DatabaseEngine,
    public readonly actor: DatabaseUserActor,
    public readonly ref: DatabaseRef,
    public readonly index: DatabaseSchemaIndex
  ) {
    this.inputs = new DatabaseInputTranslator(
      index,
      new TeamPeopleResolver(user, engine),
      new EngineLinkResolver(engine, actor, ref),
      user.timezone ?? "UTC"
    );
  }

  /**
   * Returns the absolute URL of the database.
   *
   * @returns the URL, which opens the document holding the database.
   */
  public url(): string {
    return new URL(`/db/${this.database.id}`, this.user.team.url).href;
  }

  /**
   * Returns the absolute URL of a row's page.
   *
   * @param recordId the row.
   * @returns the URL, which creates the page when first opened.
   */
  public recordUrl(recordId: string): string {
    return `${this.url()}/row/${recordId}`;
  }

  /**
   * Returns what identifies the database in tool results.
   *
   * @returns the id, title and URL.
   */
  public summary() {
    return {
      id: this.database.id,
      title: this.database.title || this.database.document?.title || "",
      url: this.url(),
    };
  }

  /**
   * Converts values keyed by property names into engine cells, people
   * included.
   *
   * @param properties the values, keyed by property name or id.
   * @returns the cells, keyed by field id.
   */
  public async cells(
    properties: Record<string, PropertyInput>
  ): Promise<Record<string, DatabaseCellValue>> {
    return DatabaseUserMapper.resolveInputs(
      this.engine,
      this.database.teamId,
      await this.inputs.cells(properties)
    );
  }

  /**
   * Presents rows with their values keyed by property names and their page.
   *
   * @param records the engine rows.
   * @returns the rows.
   */
  public async presentRecords(
    records: DatabaseRecord[]
  ): Promise<PresentedDatabaseRecord[]> {
    const presented = await presentDatabaseRecords(this.database, records);
    return presented.map((record) =>
      presentRecord(this.index, record, this.url())
    );
  }
}

/** Tags the engine's change notifications of writes made through MCP. */
const mcpOrigin = "mcp";

const viewLayouts = [
  DatabaseLayout.Table,
  DatabaseLayout.Board,
  DatabaseLayout.Calendar,
  DatabaseLayout.Gallery,
  DatabaseLayout.List,
  DatabaseLayout.Timeline,
] as const;

const zDatabaseId = z
  .string()
  .describe(
    "The database ID, or its URL (…/db/<id>). Use list_databases to find it."
  );

const zRecordId = z
  .string()
  .describe(
    "The row ID (rec…), or the row URL (…/db/<id>/row/<rowId>) returned by query_database_records."
  );

const zPropertyValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number()])),
]);

const zProperties = z
  .record(z.string(), zPropertyValue)
  .describe(
    'Values keyed by property name, e.g. {"Name":"Fix login","Status":"In progress","Assignee":"jane@example.com","Due":"2026-10-01"}. Lists for multi-selects, several people or relations.'
  );

const zCondition = z.object({
  property: z.string().describe("The property name."),
  operator: z
    .enum(filterOperatorNames)
    .describe(
      "is / is_not / contains for text and single values; has_any_of / has_all_of / has_none_of for multi-selects and lists of people or rows; greater_than, less_than… for numbers; before / after / on_or_before / on_or_after / is_within for dates; is_empty / is_not_empty for any property."
    ),
  value: z
    .union([
      zPropertyValue,
      z.object({
        mode: z.string(),
        date: z.string().optional(),
        days: z.number().int().min(0).optional(),
      }),
    ])
    .optional()
    .describe(
      'Omitted for is_empty / is_not_empty. An option name, a person\'s e-mail or "me", a row title, a number, true/false, a list for the *_of operators. Dates: "2026-10-01", or a relative mode such as "today", "this_week", "past_week", "next_month", or {"mode":"past_number_of_days","days":14}.'
    ),
});

const zFilter = z
  .array(
    z.union([
      zCondition,
      z.object({
        conjunction: z.enum(["and", "or"]),
        conditions: z.array(zCondition).min(1).max(20),
      }),
    ])
  )
  .max(20);

const zSort = z
  .array(
    z.object({
      property: z.string().describe("The property name."),
      direction: z.enum(["asc", "desc"]).optional(),
    })
  )
  .max(5)
  .describe("Properties to sort by, most significant first.");

const uuidPattern =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const engineIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

function parseDatabaseId(value: string): string {
  const id = value.match(uuidPattern)?.[0];
  if (!id) {
    throw ValidationError(
      `"${value}" is not a database ID: use list_databases to find one`
    );
  }
  return id.toLowerCase();
}

function parseRecordId(value: string): string {
  const id = value.match(/\/row\/([^/?#]+)/)?.[1] ?? value.trim();
  if (!engineIdPattern.test(id)) {
    throw ValidationError(`"${value}" is not a row ID`);
  }
  return id;
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  if (!/^\d{1,9}$/.test(cursor)) {
    throw ValidationError(
      "Invalid cursor: pass the nextCursor of a previous call"
    );
  }
  return Number(cursor);
}

/**
 * The databases of the collections the user can read whose title, or whose
 * document's title, contains the query.
 */
async function listReadableDatabases(
  user: User,
  options: {
    query?: string;
    collectionId?: string;
    offset: number;
    limit: number;
  }
): Promise<Database[]> {
  let collectionIds: string[];
  if (options.collectionId) {
    const collection = await Collection.findByPk(options.collectionId, {
      userId: user.id,
    });
    authorize(user, "readDocument", collection);
    collectionIds = [collection.id];
  } else {
    collectionIds = await user.collectionIds();
  }

  const where: WhereOptions<Database> = {
    teamId: user.teamId,
    collectionId: collectionIds,
  };
  if (options.query) {
    const pattern = QueryHelper.likeContains(options.query);
    const documents = await Document.unscoped().findAll({
      attributes: ["id"],
      where: {
        teamId: user.teamId,
        collectionId: collectionIds,
        title: { [Op.iLike]: pattern },
      },
      limit: 500,
    });
    Object.assign(where, {
      [Op.or]: [
        { title: { [Op.iLike]: pattern } },
        { documentId: documents.map((document) => document.id) },
      ],
    });
  }

  const databases = await Database.findAll({
    where,
    order: [
      ["title", "ASC"],
      ["id", "ASC"],
    ],
    offset: options.offset,
    limit: options.limit,
  });
  await Promise.all(databases.map((database) => database.loadAnchor(user.id)));
  return databases.filter((database) => can(user, "read", database));
}

function presentDatabaseSummary(user: User, database: Database) {
  const { document, collection } = database;
  const base = user.team.url;
  return {
    id: database.id,
    title: database.title || document?.title || "",
    url: new URL(`/db/${database.id}`, base).href,
    ...(collection
      ? { collection: { id: collection.id, name: collection.name } }
      : {}),
    ...(document
      ? {
          document: {
            id: document.id,
            title: document.title,
            url: new URL(document.path, base).href,
          },
        }
      : {}),
  };
}

/**
 * The property a new board is split by when none is named: the first single
 * select, else the first person property, as the app does.
 */
function defaultStackField(
  index: DatabaseSchemaIndex
): DatabaseField | undefined {
  return (
    index.fields.find(
      (field) => field.type === DatabaseFieldType.SingleSelect
    ) ?? index.fields.find((field) => field.type === DatabaseFieldType.User)
  );
}

/**
 * Returns the page of a row, creating it the first time as opening the row
 * in the app does. Reading the database is enough to create it.
 */
async function openRowPage(
  ctx: APIContext,
  session: DatabaseSession,
  recordId: string,
  known?: DatabaseRecord
): Promise<Document> {
  const { database, engine, actor, ref, index, user } = session;
  const existing = await Document.unscoped().findOne({
    attributes: ["id"],
    where: { databaseId: database.id, databaseRecordId: recordId },
  });
  if (existing) {
    return Document.findByPk(existing.id, {
      userId: user.id,
      rejectOnEmpty: true,
    });
  }

  const record = known ?? (await engine.getRecord(actor, ref, recordId));
  const primary = index.fields.find((field) => field.isPrimary);
  const iconFieldId = database.settings?.iconFieldId;
  const icon = iconFieldId ? record.fields[iconFieldId] : undefined;
  return databaseRowDocumentCreator(ctx.context, {
    database,
    recordId,
    title: primary ? cellText(record.fields[primary.id]) : "",
    icon: typeof icon === "string" && icon ? icon : null,
  });
}

/** Replaces the body of a row's page, creating the page when needed. */
async function writeRowPage(
  ctx: APIContext,
  session: DatabaseSession,
  record: DatabaseRecord,
  text: string
): Promise<void> {
  const page = await openRowPage(ctx, session, record.id, record);
  const document = await Document.findByPk(page.id, {
    userId: session.user.id,
    includeState: true,
    rejectOnEmpty: true,
  });
  authorize(session.user, "update", document);
  await documentUpdater(ctx, {
    document,
    text,
    editMode: TextEditMode.Replace,
  });
}

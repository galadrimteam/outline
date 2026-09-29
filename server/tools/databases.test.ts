import type { DatabaseField } from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import { Scope } from "@shared/types";
import type { Collection, Database, User } from "@server/models";
import { Comment, Document } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildOAuthAuthentication,
  buildUser,
  buildViewer,
} from "@server/test/factories";
import {
  buildOAuthUser,
  callMcpTool,
  mcpHeaders,
  mcpRequest,
  parseMcpListContent,
  parseMcpResponse,
} from "@server/test/McpHelper";
import { getTestServer } from "@server/test/support";
import { setEngineFactory } from "plugins/databases/server/engine";
import { FakeEngine } from "plugins/databases/server/engine/__mocks__/FakeEngine";
import databasesEnv from "plugins/databases/server/env";

const server = getTestServer();

const configured = {
  TEABLE_INTERNAL_URL: databasesEnv.TEABLE_INTERNAL_URL,
  GALADRIM_SECRET: databasesEnv.GALADRIM_SECRET,
};

let engine: FakeEngine;
let user: User;
let accessToken: string;
let collection: Collection;
let database: Database;

beforeEach(async () => {
  databasesEnv.TEABLE_INTERNAL_URL = "http://teable.test";
  databasesEnv.GALADRIM_SECRET = "secret";
  engine = new FakeEngine();
  engine.fields[1].options = {
    choices: [
      { name: "À tester", color: "blue" },
      { name: "En cours", color: "yellow" },
      { name: "Terminé", color: "green" },
    ],
  };
  engine.fields.push(dueField);
  engine.views[1].options = { stackFieldId: "fldStatus" };
  setEngineFactory(() => engine);

  ({ user, accessToken } = await buildOAuthUser());
  collection = await buildCollection({ teamId: user.teamId, userId: user.id });
  database = await buildDatabase({
    teamId: user.teamId,
    collectionId: collection.id,
    title: "Kanban",
    settings: {
      fieldMeta: {
        fldStatus: {
          statusGroups: {
            "À tester": DatabaseStatusGroup.InProgress,
            "En cours": DatabaseStatusGroup.InProgress,
            Terminé: DatabaseStatusGroup.Complete,
          },
        },
      },
    },
  });
});

afterEach(() => {
  setEngineFactory();
  Object.assign(databasesEnv, configured);
});

describe("list_databases", () => {
  it("lists the databases the user can read, with their place", async () => {
    const other = await buildUser({ teamId: user.teamId });
    const hidden = await buildCollection({
      teamId: user.teamId,
      userId: other.id,
      permission: null,
    });
    await buildDatabase({ teamId: user.teamId, collectionId: hidden.id });

    const res = await callMcpTool(server, accessToken, "list_databases");
    const data = parseMcpListContent<{
      id: string;
      url: string;
      collection: { id: string };
    }>(res?.result?.content);

    expect(data.map((item) => item.id)).toEqual([database.id]);
    expect(data[0].url).toMatch(new RegExp(`^https?://.+/db/${database.id}$`));
    expect(data[0].collection.id).toEqual(collection.id);
  });

  it("finds a database by the title of the document holding it", async () => {
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
      title: "Projet Delisle",
    });
    const anchored = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
      documentId: document.id,
      title: "",
    });

    const res = await callMcpTool(server, accessToken, "list_databases", {
      query: "delisle",
    });
    const data = parseMcpListContent<{
      id: string;
      title: string;
      document: { id: string };
    }>(res?.result?.content);

    expect(data.map((item) => item.id)).toEqual([anchored.id]);
    expect(data[0].title).toEqual("Projet Delisle");
    expect(data[0].document.id).toEqual(document.id);
  });
});

describe("get_database_schema", () => {
  it("describes properties and views by name", async () => {
    engine.views[0].filter = {
      conjunction: "and",
      filterSet: [{ fieldId: "fldStatus", operator: "is", value: "À tester" }],
    };

    const res = await callMcpTool(server, accessToken, "get_database_schema", {
      databaseId: database.id,
    });
    const data = parseResult(res);

    expect(data.properties).toContainEqual({
      name: "Status",
      type: DatabaseFieldType.SingleSelect,
      options: ["À tester", "En cours", "Terminé"],
      statusGroups: {
        in_progress: ["À tester", "En cours"],
        complete: ["Terminé"],
      },
    });
    expect(data.views).toEqual([
      {
        id: "viwGrid",
        name: "Grid",
        layout: "table",
        filter: 'Status is "À tester"',
      },
      { id: "viwBoard", name: "Board", layout: "board", groupedBy: "Status" },
    ]);
  });

  it("accepts the URL of the database", async () => {
    const res = await callMcpTool(server, accessToken, "get_database_schema", {
      databaseId: `https://example.com/db/${database.id}`,
    });
    expect(res?.result?.isError).toBeFalsy();
    expect(parseResult(res).id).toEqual(database.id);
  });
});

describe("query_database_records", () => {
  it("translates filters, sorts and views written with names", async () => {
    const res = await callMcpTool(
      server,
      accessToken,
      "query_database_records",
      {
        databaseId: database.id,
        view: "board",
        filter: [{ property: "status", operator: "is", value: "a tester" }],
        sort: [{ property: "Name", direction: "desc" }],
      }
    );

    expect(res?.result?.isError).toBeFalsy();
    const [call] = engine.callsTo("listRecords");
    expect(call.actor).toMatchObject({ outlineUserId: user.id });
    expect(call.ref).toEqual({
      externalBaseId: database.externalBaseId,
      externalTableId: database.externalTableId,
    });
    expect(call.args[0]).toMatchObject({
      viewId: "viwBoard",
      replaceFilter: false,
      filter: {
        conjunction: "and",
        filterSet: [
          { fieldId: "fldStatus", operator: "is", value: "À tester" },
        ],
      },
      sort: { sortObjs: [{ fieldId: "fldName", order: "desc" }] },
      skip: 0,
      take: 25,
    });
  });

  it("searches every row when no view is named", async () => {
    await callMcpTool(server, accessToken, "query_database_records", {
      databaseId: database.id,
    });

    expect(engine.callsTo("listRecords")[0].args[0]).toMatchObject({
      viewId: "viwGrid",
      replaceFilter: true,
      filter: null,
    });
  });

  it("returns rows keyed by property name with the URL of their page", async () => {
    engine.addRecord("rec1", {
      fldName: "Fix login",
      fldStatus: "À tester",
      fldPerson: { id: "usr1", title: user.name, email: user.email ?? "" },
    });

    const res = await callMcpTool(
      server,
      accessToken,
      "query_database_records",
      { databaseId: database.id }
    );
    const data = parseResult(res);

    expect(data.total).toEqual(1);
    expect(data.records).toEqual([
      {
        id: "rec1",
        url: expect.stringMatching(new RegExp(`/db/${database.id}/row/rec1$`)),
        properties: {
          Name: "Fix login",
          Status: "À tester",
          Person: { name: user.name, email: user.email },
        },
      },
    ]);
  });

  it("resolves people by e-mail and me, in groups", async () => {
    const colleague = await buildUser({ teamId: user.teamId });

    await callMcpTool(server, accessToken, "query_database_records", {
      databaseId: database.id,
      filter: [
        {
          conjunction: "or",
          conditions: [
            { property: "Person", operator: "is", value: colleague.email },
            { property: "Person", operator: "is", value: "me" },
          ],
        },
        { property: "Status", operator: "is_not", value: "Terminé" },
      ],
    });

    expect(engine.callsTo("listRecords")[0].args[0]).toMatchObject({
      filter: {
        conjunction: "and",
        filterSet: [
          {
            conjunction: "or",
            filterSet: [
              { fieldId: "fldPerson", operator: "is", value: "usr1" },
              { fieldId: "fldPerson", operator: "is", value: "Me" },
            ],
          },
          { fieldId: "fldStatus", operator: "isNot", value: "Terminé" },
        ],
      },
    });
  });

  it("reads dates as days or relative periods", async () => {
    await callMcpTool(server, accessToken, "query_database_records", {
      databaseId: database.id,
      filter: [
        { property: "echeance", operator: "on_or_before", value: "2026-10-01" },
        {
          property: "Échéance",
          operator: "is_within",
          value: { mode: "past_number_of_days", days: 14 },
        },
        { property: "Échéance", operator: "greater_than", value: "today" },
      ],
    });

    const timeZone = user.timezone ?? "UTC";
    expect(engine.callsTo("listRecords")[0].args[0]).toMatchObject({
      filter: {
        filterSet: [
          {
            fieldId: "fldDue",
            operator: "isOnOrBefore",
            value: {
              mode: "exactDate",
              exactDate: "2026-10-01T12:00:00.000Z",
              timeZone,
            },
          },
          {
            fieldId: "fldDue",
            operator: "isWithIn",
            value: { mode: "pastNumberOfDays", numberOfDays: 14, timeZone },
          },
          {
            fieldId: "fldDue",
            operator: "isAfter",
            value: { mode: "today", timeZone },
          },
        ],
      },
    });
  });

  it("pages through the rows with a cursor", async () => {
    engine.addRecord("rec1", { fldName: "One" });
    engine.addRecord("rec2", { fldName: "Two" });
    engine.addRecord("rec3", { fldName: "Three" });

    const first = parseResult(
      await callMcpTool(server, accessToken, "query_database_records", {
        databaseId: database.id,
        limit: 2,
      })
    );
    const second = parseResult(
      await callMcpTool(server, accessToken, "query_database_records", {
        databaseId: database.id,
        limit: 2,
        cursor: first.nextCursor,
      })
    );

    expect(first.records.map((row: { id: string }) => row.id)).toEqual([
      "rec1",
      "rec2",
    ]);
    expect(first.nextCursor).toEqual("2");
    expect(second.records.map((row: { id: string }) => row.id)).toEqual([
      "rec3",
    ]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("names the properties and options that exist on a mistake", async () => {
    const unknownProperty = await callMcpTool(
      server,
      accessToken,
      "query_database_records",
      {
        databaseId: database.id,
        filter: [{ property: "Statut", operator: "is", value: "Terminé" }],
      }
    );
    const unknownOption = await callMcpTool(
      server,
      accessToken,
      "query_database_records",
      {
        databaseId: database.id,
        filter: [{ property: "Status", operator: "is", value: "Done" }],
      }
    );

    expect(unknownProperty?.result?.isError).toBe(true);
    expect(errorText(unknownProperty)).toContain('"Status"');
    expect(unknownOption?.result?.isError).toBe(true);
    expect(errorText(unknownOption)).toContain('"Terminé"');
    expect(engine.callsTo("listRecords")).toHaveLength(0);
  });
});

describe("get_database_record", () => {
  it("returns the row with the markdown of its page", async () => {
    engine.addRecord("rec1", { fldName: "Fix login" });
    const page = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
      text: "Steps to reproduce",
    });
    await Document.update(
      { databaseId: database.id, databaseRecordId: "rec1" },
      { where: { id: page.id } }
    );

    const res = await callMcpTool(server, accessToken, "get_database_record", {
      databaseId: database.id,
      recordId: `https://example.com/db/${database.id}/row/rec1`,
    });
    const data = parseResult(res);

    expect(data.record).toMatchObject({
      id: "rec1",
      pageId: page.id,
      properties: { Name: "Fix login" },
    });
    expect(data.page.id).toEqual(page.id);
    expect(data.page.text).toContain("Steps to reproduce");
  });
});

describe("create_database_record", () => {
  it("writes values given by name, people by e-mail", async () => {
    const colleague = await buildUser({ teamId: user.teamId });

    const res = await callMcpTool(
      server,
      accessToken,
      "create_database_record",
      {
        databaseId: database.id,
        properties: {
          Name: "New card",
          status: "en cours",
          Person: colleague.email,
          Échéance: "2026-10-01",
        },
      }
    );

    expect(res?.result?.isError).toBeFalsy();
    expect(engine.callsTo("createRecord")[0].args[0]).toEqual({
      fields: {
        fldName: "New card",
        fldStatus: "En cours",
        fldPerson: expect.objectContaining({
          id: "usr1",
          outlineUserId: colleague.id,
        }),
        fldDue: "2026-10-01",
      },
    });
    expect(parseResult(res).properties).toMatchObject({
      Name: "New card",
      Status: "En cours",
      Person: { name: colleague.name },
    });
  });

  it("writes the body of the row's page", async () => {
    const res = await callMcpTool(
      server,
      accessToken,
      "create_database_record",
      {
        databaseId: database.id,
        properties: { Name: "Spec" },
        content: "The **details** of the feature",
      }
    );
    const data = parseResult(res);

    expect(data.pageId).toBeDefined();
    const page = await Document.findByPk(data.pageId, { rejectOnEmpty: true });
    expect(page.title).toEqual("Spec");
    expect(page.databaseRecordId).toEqual(data.id);
    expect(
      await DocumentHelper.toMarkdown(page, { includeTitle: false })
    ).toContain("The **details** of the feature");
  });

  it("refuses an option that does not exist and computed properties", async () => {
    engine.fields.push({
      ...dueField,
      id: "fldFormula",
      name: "Delay",
      type: DatabaseFieldType.Formula,
      isComputed: true,
    });

    const option = await callMcpTool(
      server,
      accessToken,
      "create_database_record",
      { databaseId: database.id, properties: { Status: "Blocked" } }
    );
    const computed = await callMcpTool(
      server,
      accessToken,
      "create_database_record",
      { databaseId: database.id, properties: { Delay: "2026-10-01" } }
    );

    expect(option?.result?.isError).toBe(true);
    expect(computed?.result?.isError).toBe(true);
    expect(engine.callsTo("createRecord")).toHaveLength(0);
  });
});

describe("update_database_record", () => {
  it("updates the properties given by name", async () => {
    engine.addRecord("rec1", { fldName: "Card", fldStatus: "À tester" });

    const res = await callMcpTool(
      server,
      accessToken,
      "update_database_record",
      {
        databaseId: database.id,
        recordId: "rec1",
        properties: { Status: "Terminé", Person: "me" },
      }
    );

    expect(res?.result?.isError).toBeFalsy();
    const [call] = engine.callsTo("updateRecord");
    expect(call.args[0]).toEqual("rec1");
    expect(call.args[1]).toEqual({
      fields: {
        fldStatus: "Terminé",
        fldPerson: expect.objectContaining({ outlineUserId: user.id }),
      },
    });
    expect(parseResult(res).properties).toMatchObject({
      Name: "Card",
      Status: "Terminé",
    });
  });

  it("refuses a member who can only read", async () => {
    engine.addRecord("rec1", { fldName: "Card" });
    const viewer = await buildViewer({ teamId: user.teamId });
    const auth = await buildOAuthAuthentication({
      user: viewer,
      scope: [Scope.Read, Scope.Write, Scope.Create],
    });

    const read = await callMcpTool(
      server,
      auth.accessToken!,
      "query_database_records",
      { databaseId: database.id }
    );
    const write = await callMcpTool(
      server,
      auth.accessToken!,
      "update_database_record",
      { databaseId: database.id, recordId: "rec1", properties: { Name: "X" } }
    );

    expect(read?.result?.isError).toBeFalsy();
    expect(write?.result?.isError).toBe(true);
    expect(engine.callsTo("updateRecord")).toHaveLength(0);
  });
});

describe("move_card", () => {
  it("moves a card to a column by name, next to another card", async () => {
    engine.addRecord("rec1", { fldName: "One", fldStatus: "À tester" });
    engine.addRecord("rec2", { fldName: "Two", fldStatus: "Terminé" });

    const res = await callMcpTool(server, accessToken, "move_card", {
      databaseId: database.id,
      recordId: "rec1",
      column: "termine",
      after: "rec2",
    });

    expect(res?.result?.isError).toBeFalsy();
    expect(engine.callsTo("moveRecords")[0].args[0]).toEqual({
      viewId: "viwBoard",
      recordIds: ["rec1"],
      anchorId: "rec2",
      position: "after",
      fields: { fldStatus: "Terminé" },
    });
    expect(parseResult(res).properties.Status).toEqual("Terminé");
  });

  it("reorders a card within its column", async () => {
    engine.addRecord("rec1", { fldName: "One" });
    engine.addRecord("rec2", { fldName: "Two" });

    await callMcpTool(server, accessToken, "move_card", {
      databaseId: database.id,
      recordId: "rec2",
      before: "rec1",
    });

    expect(engine.callsTo("moveRecords")[0].args[0]).toEqual({
      viewId: "viwBoard",
      recordIds: ["rec2"],
      anchorId: "rec1",
      position: "before",
      fields: undefined,
    });
  });

  it("needs a column or a card to move next to", async () => {
    engine.addRecord("rec1", { fldName: "One" });

    const res = await callMcpTool(server, accessToken, "move_card", {
      databaseId: database.id,
      recordId: "rec1",
    });

    expect(res?.result?.isError).toBe(true);
    expect(engine.callsTo("moveRecords")).toHaveLength(0);
  });
});

describe("comment_database_record", () => {
  it("comments on the row's page, creating it once", async () => {
    engine.addRecord("rec1", { fldName: "Fix login" });

    const first = parseResult(
      await callMcpTool(server, accessToken, "comment_database_record", {
        databaseId: database.id,
        recordId: "rec1",
        text: "Tested, **works**",
      })
    );
    const second = parseResult(
      await callMcpTool(server, accessToken, "comment_database_record", {
        databaseId: database.id,
        recordId: "rec1",
        text: "Again",
      })
    );

    expect(second.documentId).toEqual(first.documentId);
    const page = await Document.findByPk(first.documentId);
    expect(page?.title).toEqual("Fix login");
    expect(page?.databaseId).toEqual(database.id);
    const comments = await Comment.findAll({
      where: { documentId: first.documentId },
    });
    expect(comments).toHaveLength(2);
    expect(comments.map((comment) => comment.createdById)).toEqual([
      user.id,
      user.id,
    ]);
  });

  it("does not create a page for a row that does not exist", async () => {
    const res = await callMcpTool(
      server,
      accessToken,
      "comment_database_record",
      { databaseId: database.id, recordId: "recMissing", text: "Hello" }
    );

    expect(res?.result?.isError).toBe(true);
    expect(
      await Document.count({ where: { databaseId: database.id } })
    ).toEqual(0);
  });
});

describe("create_database_view", () => {
  it("creates a board split by a property, filtered by name", async () => {
    const res = await callMcpTool(server, accessToken, "create_database_view", {
      databaseId: database.id,
      name: "Mine",
      layout: "board",
      filter: [{ property: "Person", operator: "is", value: "me" }],
    });

    expect(res?.result?.isError).toBeFalsy();
    expect(engine.callsTo("createView")[0].args[0]).toEqual({
      name: "Mine",
      type: "kanban",
      options: { stackFieldId: "fldStatus" },
    });
    expect(engine.callsTo("updateView")[0].args[1]).toMatchObject({
      filter: {
        conjunction: "and",
        filterSet: [{ fieldId: "fldPerson", operator: "is", value: "Me" }],
      },
    });
    expect(parseResult(res)).toMatchObject({
      name: "Mine",
      layout: "board",
      groupedBy: "Status",
      filter: 'Person is "Me"',
    });
  });

  it("keeps a list layout in Outline's settings", async () => {
    const res = await callMcpTool(server, accessToken, "create_database_view", {
      databaseId: database.id,
      name: "List",
      layout: "list",
    });
    const data = parseResult(res);

    expect(data.layout).toEqual("list");
    await database.reload();
    expect(database.settings.viewOverrides?.[data.id]).toEqual({
      layout: "list",
    });
  });
});

describe("permissions", () => {
  it("refuses a member of another team", async () => {
    const stranger = await buildOAuthUser();

    const res = await callMcpTool(
      server,
      stranger.accessToken,
      "query_database_records",
      { databaseId: database.id }
    );

    expect(res?.result?.isError).toBe(true);
    expect(errorText(res)).toContain("Authorization");
    expect(engine.calls).toHaveLength(0);
  });

  it("refuses a member without access to the collection", async () => {
    const owner = await buildUser({ teamId: user.teamId });
    const hidden = await buildCollection({
      teamId: user.teamId,
      userId: owner.id,
      permission: null,
    });
    const secret = await buildDatabase({
      teamId: user.teamId,
      collectionId: hidden.id,
    });

    const res = await callMcpTool(server, accessToken, "get_database_record", {
      databaseId: secret.id,
      recordId: "rec1",
    });

    expect(res?.result?.isError).toBe(true);
    expect(engine.calls).toHaveLength(0);
  });

  it("offers only the reading tools to a read-only token", async () => {
    const auth = await buildOAuthAuthentication({ user, scope: [Scope.Read] });

    const names = await listTools(auth.accessToken!);

    expect(names).toEqual(
      expect.arrayContaining([
        "list_databases",
        "get_database_schema",
        "query_database_records",
        "get_database_record",
      ])
    );
    expect(names).not.toContain("update_database_record");
    expect(names).not.toContain("move_card");
    expect(names).not.toContain("comment_database_record");
  });

  it("offers the database tools without Teable, the Outline engine needing nothing", async () => {
    databasesEnv.TEABLE_INTERNAL_URL = undefined;

    const names = await listTools(accessToken);

    expect(names).toContain("list_databases");
  });
});

const dueField: DatabaseField = {
  id: "fldDue",
  name: "Échéance",
  type: DatabaseFieldType.Date,
  options: {},
  isPrimary: false,
  isComputed: false,
  isLookup: false,
  cellValueType: "dateTime",
  isMultipleCellValue: false,
};

function parseResult(res: Awaited<ReturnType<typeof callMcpTool>>) {
  return JSON.parse(res?.result?.content?.[0]?.text ?? "null");
}

function errorText(res: Awaited<ReturnType<typeof callMcpTool>>): string {
  return res?.result?.content?.[0]?.text ?? "";
}

async function listTools(token: string): Promise<string[]> {
  const { body } = mcpRequest("tools/list");
  const res = await server.post("/mcp/", { headers: mcpHeaders(token), body });
  const parsed = await parseMcpResponse(res);
  const result = parsed?.result as { tools?: { name: string }[] } | undefined;
  return (result?.tools ?? []).map((tool) => tool.name);
}

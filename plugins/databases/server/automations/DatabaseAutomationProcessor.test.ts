import type {
  DatabaseAutomationAction,
  DatabaseAutomationTrigger,
} from "@shared/databases/automations";
import type { DatabaseFilter } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { Comment, DatabaseAutomation, Document } from "@server/models";
import type { Collection, Database, User } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildUser,
} from "@server/test/factories";
import type { DatabaseEvent } from "@server/types";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { SlackExecutor } from "./actions/SlackExecutor";
import { DatabaseAutomationProcessor } from "./DatabaseAutomationProcessor";
import {
  DatabaseAutomationRunner,
  defaultExecutors,
} from "./DatabaseAutomationRunner";

let engine: FakeEngine;
let origins: (string | null | undefined)[];
let user: User;
let collection: Collection;
let database: Database;

beforeEach(async () => {
  engine = new FakeEngine();
  engine.fields.push({
    id: "fldDate",
    name: "Date Dev",
    type: DatabaseFieldType.Date,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "dateTime",
    isMultipleCellValue: false,
  });
  origins = [];
  setEngineFactory((_database, options) => {
    origins.push(options.origin);
    return engine;
  });
  user = await buildUser();
  collection = await buildCollection({ teamId: user.teamId, userId: user.id });
  database = await buildDatabase({
    teamId: user.teamId,
    collectionId: collection.id,
  });
});

afterEach(() => {
  setEngineFactory();
});

function buildAutomation(
  trigger: DatabaseAutomationTrigger,
  actions: DatabaseAutomationAction[],
  conditions: DatabaseFilter | null = null
) {
  return DatabaseAutomation.create({
    teamId: database.teamId,
    databaseId: database.id,
    name: "Dev started",
    trigger,
    conditions,
    actions,
    createdById: user.id,
  });
}

function statusChange(
  overrides: Partial<DatabaseEvent["data"]> = {},
  actorId = user.id
): DatabaseEvent {
  return {
    name: "databases.change",
    modelId: database.id,
    teamId: database.teamId,
    actorId,
    collectionId: database.collectionId,
    documentId: null,
    data: {
      kinds: ["record.update"],
      recordIds: ["rec1"],
      origin: "app",
      changes: [
        {
          recordId: "rec1",
          fieldId: "fldStatus",
          before: "À faire",
          after: "En Développement",
        },
      ],
      ...overrides,
    },
  };
}

const devStarted: DatabaseAutomationTrigger = {
  type: "propertyChanged",
  fieldId: "fldStatus",
  to: ["En Développement"],
};

describe("DatabaseAutomationProcessor", () => {
  it("is only queued for databases with enabled automations", async () => {
    expect(await DatabaseAutomationProcessor.shouldQueue(statusChange())).toBe(
      false
    );
    const automation = await buildAutomation(devStarted, [
      { type: "setProperty", fieldId: "fldDate", value: { kind: "now" } },
    ]);
    expect(await DatabaseAutomationProcessor.shouldQueue(statusChange())).toBe(
      true
    );
    expect(
      await DatabaseAutomationProcessor.shouldQueue(
        statusChange({ origin: `automation:${automation.id}:3` })
      )
    ).toBe(false);
  });

  it("writes today's date when the status changes to a value", async () => {
    engine.addRecord("rec1", {
      fldName: "Login",
      fldStatus: "En Développement",
    });
    const automation = await buildAutomation(devStarted, [
      { type: "setProperty", fieldId: "fldDate", value: { kind: "now" } },
    ]);

    await new DatabaseAutomationProcessor().perform(statusChange());

    const [update] = engine.callsTo("updateRecord");
    expect(update.actor).toEqual("system");
    expect(update.args[0]).toEqual("rec1");
    expect(update.args[1]).toMatchObject({
      fields: { fldDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
    });
    expect(origins).toContain(`automation:${automation.id}:1`);
    await automation.reload();
    expect(automation.lastRunAt).not.toBeNull();
    expect(automation.lastError).toBeNull();
  });

  it("ignores other values, its own writes and chains that are too deep", async () => {
    engine.addRecord("rec1", { fldStatus: "En Développement" });
    const automation = await buildAutomation(devStarted, [
      { type: "setProperty", fieldId: "fldDate", value: { kind: "now" } },
    ]);
    const other = "00000000-0000-4000-8000-000000000000";

    await new DatabaseAutomationProcessor().perform(
      statusChange({
        changes: [
          { recordId: "rec1", fieldId: "fldStatus", before: "A", after: "B" },
        ],
      })
    );
    await new DatabaseAutomationProcessor().perform(
      statusChange({ origin: `automation:${automation.id}:1` })
    );
    await new DatabaseAutomationProcessor().perform(
      statusChange({ origin: `automation:${other}:3` })
    );
    expect(engine.callsTo("updateRecord")).toHaveLength(0);

    await new DatabaseAutomationProcessor().perform(
      statusChange({ origin: `automation:${other}:2` })
    );
    expect(engine.callsTo("updateRecord")).toHaveLength(1);
    expect(origins).toContain(`automation:${automation.id}:3`);
  });

  it("runs on created rows that match the conditions, with the person who created them", async () => {
    engine.addRecord("rec1", { fldStatus: "Bug" });
    engine.addRecord("rec2", { fldStatus: "Idée" });
    await buildAutomation(
      { type: "recordCreated" },
      [{ type: "setProperty", fieldId: "fldPerson", value: { kind: "me" } }],
      {
        conjunction: "and",
        filterSet: [{ fieldId: "fldStatus", operator: "is", value: "Bug" }],
      }
    );

    await new DatabaseAutomationProcessor().perform(
      statusChange({ kinds: ["record.create"], recordIds: ["rec1", "rec2"] })
    );

    const updates = engine.callsTo("updateRecord");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual("rec1");
    expect(updates[0].args[1]).toMatchObject({
      fields: { fldPerson: { outlineUserId: user.id, id: "usr1" } },
    });
  });

  it("notifies people with a comment mentioning them on the row's page", async () => {
    const colleague = await buildUser({ teamId: user.teamId });
    engine.addRecord("rec1", {
      fldName: "Login",
      fldPerson: {
        id: "usrColleague",
        title: colleague.name,
        email: colleague.email ?? "",
      },
    });
    await buildAutomation(devStarted, [
      {
        type: "notify",
        personFieldId: "fldPerson",
        message: "{{title}} is in development",
      },
    ]);

    await new DatabaseAutomationProcessor().perform(statusChange());

    const page = await Document.findOne({
      where: { databaseId: database.id, databaseRecordId: "rec1" },
    });
    expect(page?.title).toEqual("Login");
    const comment = await Comment.findOne({ where: { documentId: page?.id } });
    expect(comment?.createdById).toEqual(user.id);
    const paragraph = comment?.data.content?.[0];
    expect(paragraph?.content?.[0].text).toEqual(
      "⚡ Dev started · Login is in development"
    );
    expect(paragraph?.content?.[2]).toMatchObject({
      type: "mention",
      attrs: { modelId: colleague.id, actorId: user.id },
    });
  });

  it("posts the message to Slack", async () => {
    engine.addRecord("rec1", {
      fldName: "Login",
      fldStatus: "En Développement",
    });
    await buildAutomation(devStarted, [
      {
        type: "slack",
        webhookUrl: "https://hooks.slack.com/services/T0/B0/xyz",
        message: "{{title}} → {{property:Status}}",
      },
    ]);
    const posts: { url: string; body: object }[] = [];
    const runner = new DatabaseAutomationRunner({
      ...defaultExecutors(),
      slack: new SlackExecutor(async (url, body) => {
        posts.push({ url, body });
      }),
    });

    await new DatabaseAutomationProcessor(runner).perform(statusChange());

    expect(posts).toEqual([
      {
        url: "https://hooks.slack.com/services/T0/B0/xyz",
        body: { text: "Login → En Développement" },
      },
    ]);
  });

  it("creates a row in another database linked to the row", async () => {
    engine.addRecord("rec1", { fldName: "Login" });
    const tasks = await buildDatabase({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    await buildAutomation(devStarted, [
      {
        type: "createRecord",
        databaseId: tasks.id,
        fields: {
          fldName: { kind: "template", text: "Review {{title}}" },
          fldStatus: { kind: "static", value: "À faire" },
          fldGone: { kind: "clear" },
        },
      },
    ]);

    await new DatabaseAutomationProcessor().perform(statusChange());

    const [create] = engine.callsTo("createRecord");
    expect(create.ref?.externalTableId).toEqual(tasks.externalTableId);
    expect(create.args[0]).toEqual({
      fields: { fldName: "Review Login", fldStatus: "À faire" },
    });
  });

  it("keeps the error of an action that failed and runs the next ones", async () => {
    engine.addRecord("rec1", { fldName: "Login" });
    const automation = await buildAutomation(devStarted, [
      { type: "setProperty", fieldId: "fldGone", value: { kind: "clear" } },
      { type: "setProperty", fieldId: "fldDate", value: { kind: "now" } },
    ]);

    await new DatabaseAutomationProcessor().perform(statusChange());

    expect(engine.callsTo("updateRecord")).toHaveLength(1);
    await automation.reload();
    expect(automation.lastError).toContain("setProperty:");
  });
});

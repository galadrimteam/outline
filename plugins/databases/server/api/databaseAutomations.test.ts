import { DatabaseFieldType } from "@shared/databases/types";
import { DatabaseAutomation } from "@server/models";
import type { Collection, Database, User } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildUser,
  buildViewer,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";

// Registered here until the plugin's index lists these routes.
await vi.hoisted(async () => {
  const { Hook, PluginManager } = await import("@server/utils/PluginManager");
  const { default: router } = await import("./databaseAutomations");
  if (!PluginManager.getHooks(Hook.API).some((hook) => hook.value === router)) {
    PluginManager.add({ type: Hook.API, value: router });
  }
});

const server = getTestServer();

let engine: FakeEngine;
let user: User;
let collection: Collection;
let database: Database;

beforeEach(async () => {
  engine = new FakeEngine();
  engine.fields.push({
    id: "fldButton",
    name: "Start",
    type: DatabaseFieldType.Button,
    options: { label: "Start" },
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
  });
  setEngineFactory(() => engine);
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

const setStatus = {
  type: "setProperty",
  fieldId: "fldStatus",
  value: { kind: "static", value: "Terminé" },
};

describe("#databaseAutomations.create", () => {
  it("creates an automation checked against the database's fields", async () => {
    const res = await server.post("/api/databaseAutomations.create", user, {
      body: {
        databaseId: database.id,
        name: "Done",
        trigger: { type: "propertyChanged", fieldId: "fldStatus", to: ["OK"] },
        actions: [setStatus],
      },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toMatchObject({
      databaseId: database.id,
      name: "Done",
      enabled: true,
      createdById: user.id,
      conditions: null,
    });
  });

  it("refuses unknown fields, values a field cannot take and foreign webhooks", async () => {
    const post = (body: object) =>
      server.post("/api/databaseAutomations.create", user, {
        body: { databaseId: database.id, ...body },
      });

    const unknownField = await post({
      trigger: { type: "propertyChanged", fieldId: "fldNope" },
      actions: [setStatus],
    });
    expect(unknownField.status).toEqual(400);

    const notADate = await post({
      trigger: { type: "recordCreated" },
      actions: [
        { type: "setProperty", fieldId: "fldStatus", value: { kind: "now" } },
      ],
    });
    expect(notADate.status).toEqual(400);

    const webhook = await post({
      trigger: { type: "recordCreated" },
      actions: [
        { type: "slack", webhookUrl: "https://evil.test/hook", message: "" },
      ],
    });
    expect(webhook.status).toEqual(400);
  });

  it("needs the right to edit the database", async () => {
    const viewer = await buildViewer({ teamId: user.teamId });
    const res = await server.post("/api/databaseAutomations.create", viewer, {
      body: {
        databaseId: database.id,
        trigger: { type: "recordCreated" },
        actions: [setStatus],
      },
    });
    expect(res.status).toEqual(403);
  });
});

describe("#databaseAutomations.list, update and delete", () => {
  it("lists, toggles and deletes the automations of a database", async () => {
    const automation = await DatabaseAutomation.create({
      teamId: database.teamId,
      databaseId: database.id,
      name: "Done",
      trigger: { type: "recordCreated" },
      actions: [],
      createdById: user.id,
    });

    const list = await server.post("/api/databaseAutomations.list", user, {
      body: { databaseId: database.id },
    });
    expect(
      (await list.json()).data.map((item: { id: string }) => item.id)
    ).toEqual([automation.id]);

    const update = await server.post("/api/databaseAutomations.update", user, {
      body: { id: automation.id, enabled: false },
    });
    expect((await update.json()).data.enabled).toBe(false);

    const stranger = await buildUser();
    const denied = await server.post(
      "/api/databaseAutomations.delete",
      stranger,
      {
        body: { id: automation.id },
      }
    );
    expect(denied.status).toEqual(404);

    const removed = await server.post("/api/databaseAutomations.delete", user, {
      body: { id: automation.id },
    });
    expect(removed.status).toEqual(200);
    expect(await DatabaseAutomation.findByPk(automation.id)).toBeNull();
  });
});

describe("#databaseRecords.clickButton", () => {
  it("runs the automations of the button on the row", async () => {
    engine.addRecord("rec1", { fldName: "Login" });
    await DatabaseAutomation.create({
      teamId: database.teamId,
      databaseId: database.id,
      trigger: { type: "buttonClicked", fieldId: "fldButton" },
      actions: [
        {
          type: "setProperty",
          fieldId: "fldStatus",
          value: { kind: "static", value: "En cours" },
        },
      ],
      createdById: user.id,
    });

    const res = await server.post("/api/databaseRecords.clickButton", user, {
      body: { databaseId: database.id, recordId: "rec1", fieldId: "fldButton" },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toEqual({ ran: 1, errors: [] });
    expect(engine.records.get("rec1")?.fields.fldStatus).toEqual("En cours");
  });

  it("refuses a property that is not a button", async () => {
    engine.addRecord("rec1", { fldName: "Login" });
    const res = await server.post("/api/databaseRecords.clickButton", user, {
      body: { databaseId: database.id, recordId: "rec1", fieldId: "fldStatus" },
    });
    expect(res.status).toEqual(400);
  });
});

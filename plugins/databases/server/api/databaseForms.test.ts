import { randomUUID } from "node:crypto";
import { DatabaseLayout } from "@shared/databases/types";
import type { DatabaseSettings } from "@shared/databases/types";
import type { Database, User } from "@server/models";
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
  const { default: router } = await import("./databaseForms");
  if (!PluginManager.getHooks(Hook.API).some((hook) => hook.value === router)) {
    PluginManager.add({ type: Hook.API, value: router });
  }
});

const server = getTestServer();

let engine: FakeEngine;
let origins: (string | null | undefined)[];
let user: User;
let database: Database;
let slug: string;

const formSettings = (form: object): DatabaseSettings => ({
  viewOverrides: { viwForm: { form } },
});

beforeEach(async () => {
  engine = new FakeEngine();
  engine.fields[1].options = {
    choices: [
      { name: "Bug", color: "red" },
      { name: "Idée", color: "blue" },
    ],
    foreignTableId: "tblPrivate",
  };
  engine.views.push({
    ...engine.views[0],
    id: "viwForm",
    name: "Maintenance",
    type: "form",
    layout: DatabaseLayout.Form,
    description: "Tell us what is wrong",
    options: { submitLabel: "Send" },
    columnMeta: {
      fldStatus: { order: 0, visible: true, required: true },
      fldName: { order: 1, visible: true },
      fldPerson: { order: 2, visible: true },
    },
  });
  origins = [];
  setEngineFactory((_database, options) => {
    origins.push(options.origin);
    return engine;
  });
  user = await buildUser();
  const collection = await buildCollection({
    teamId: user.teamId,
    userId: user.id,
  });
  slug = randomUUID().replace(/-/g, "").slice(0, 16);
  database = await buildDatabase({
    teamId: user.teamId,
    collectionId: collection.id,
    settings: formSettings({ public: true, slug, successMessage: "Merci !" }),
  });
});

afterEach(() => {
  setEngineFactory();
});

describe("#databaseForms.info", () => {
  it("describes a public form to anyone, without people questions nor private options", async () => {
    const res = await server.post("/api/databaseForms.info", {
      body: { slug },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data).toMatchObject({
      databaseId: database.id,
      viewId: "viwForm",
      title: "Maintenance",
      description: "Tell us what is wrong",
      submitLabel: "Send",
      successMessage: "Merci !",
      requireLogin: false,
      canSubmit: true,
    });
    expect(
      body.data.questions.map(
        (question: { field: { id: string }; required: boolean }) => [
          question.field.id,
          question.required,
        ]
      )
    ).toEqual([
      ["fldStatus", true],
      ["fldName", false],
    ]);
    expect(body.data.questions[0].field.options.foreignTableId).toBeUndefined();
  });

  it("does not find a form that is not shared", async () => {
    await database.update({
      settings: formSettings({ public: false, slug }),
    });
    const res = await server.post("/api/databaseForms.info", {
      body: { slug },
    });
    expect(res.status).toEqual(404);
  });

  it("withholds the questions of a form that requires a login", async () => {
    await database.update({
      settings: formSettings({ public: true, slug, requireLogin: true }),
    });

    const anonymous = await server.post("/api/databaseForms.info", {
      body: { slug },
    });
    expect((await anonymous.json()).data).toMatchObject({
      canSubmit: false,
      questions: [],
    });

    const member = await server.post("/api/databaseForms.info", user, {
      body: { slug },
    });
    const body = await member.json();
    expect(body.data.canSubmit).toBe(true);
    expect(body.data.questions).toHaveLength(3);
  });
});

describe("#databaseForms.submit", () => {
  it("creates a row as the service account with the form's origin", async () => {
    const res = await server.post("/api/databaseForms.submit", {
      body: { slug, fields: { fldStatus: "Bug", fldName: "Export is slow" } },
    });

    expect(res.status).toEqual(200);
    const [create] = engine.callsTo("createRecord");
    expect(create.actor).toEqual("system");
    expect(create.args[0]).toEqual({
      fields: { fldStatus: "Bug", fldName: "Export is slow" },
    });
    expect(origins).toContain("form:viwForm");
  });

  it("refuses answers outside the form and missing required answers", async () => {
    const hidden = await server.post("/api/databaseForms.submit", {
      body: { slug, fields: { fldStatus: "Bug", fldPerson: null } },
    });
    expect(hidden.status).toEqual(400);

    const missing = await server.post("/api/databaseForms.submit", {
      body: { slug, fields: { fldName: "x" } },
    });
    expect(missing.status).toEqual(400);
    expect(engine.callsTo("createRecord")).toHaveLength(0);
  });

  it("pretends to take what a robot filled", async () => {
    const res = await server.post("/api/databaseForms.submit", {
      body: { slug, fields: { fldStatus: "Bug" }, website: "http://spam" },
    });
    expect(res.status).toEqual(200);
    expect(engine.callsTo("createRecord")).toHaveLength(0);
  });

  it("asks for a login, then writes as the member", async () => {
    await database.update({
      settings: formSettings({ public: true, slug, requireLogin: true }),
    });

    const anonymous = await server.post("/api/databaseForms.submit", {
      body: { slug, fields: { fldStatus: "Bug" } },
    });
    expect(anonymous.status).toEqual(401);

    const member = await server.post("/api/databaseForms.submit", user, {
      body: {
        slug,
        fields: { fldStatus: "Idée", fldPerson: { outlineUserId: user.id } },
      },
    });
    expect(member.status).toEqual(200);
    const [create] = engine.callsTo("createRecord");
    expect(create.actor).toMatchObject({ outlineUserId: user.id });
  });
});

describe("#databaseForms.share", () => {
  it("shares a form view at a new address", async () => {
    await database.update({ settings: {} });

    const res = await server.post("/api/databaseForms.share", user, {
      body: { databaseId: database.id, viewId: "viwForm", public: true },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    expect(body.data.public).toBe(true);
    expect(body.data.url).toEqual(`/f/${body.data.slug}`);
    const info = await server.post("/api/databaseForms.info", {
      body: { slug: body.data.slug },
    });
    expect(info.status).toEqual(200);
  });

  it("refuses a view that is not a form, and readers", async () => {
    const grid = await server.post("/api/databaseForms.share", user, {
      body: { databaseId: database.id, viewId: "viwGrid", public: true },
    });
    expect(grid.status).toEqual(404);

    const viewer = await buildViewer({ teamId: user.teamId });
    const denied = await server.post("/api/databaseForms.share", viewer, {
      body: { databaseId: database.id, viewId: "viwForm", public: true },
    });
    expect(denied.status).toEqual(403);
  });
});

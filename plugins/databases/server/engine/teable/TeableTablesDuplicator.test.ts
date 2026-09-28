import { http, HttpResponse } from "msw";
import Redis from "@server/storage/redis";
import { server } from "@server/test/msw";
import type { DatabaseUserActor } from "../DatabaseEngine";
import { TeableClient } from "./TeableClient";
import { TeableIdentity } from "./TeableIdentity";
import { TeableTablesDuplicator } from "./TeableTablesDuplicator";

const teable = "http://teable.test";
const secret = "test-secret";
const actor: DatabaseUserActor = {
  email: "ada@example.com",
  name: "Ada",
  outlineUserId: "5b1b1e5e-8c4c-4c1b-9d7e-1c7f0e5a4b3c",
};

/** « Suivi Kanban » and « Epics », linked both ways, as in the MGE template. */
const sourceFields: Record<string, object[]> = {
  tblKanban: [
    { id: "fldKName", name: "Nom", type: "singleLineText", options: {} },
    {
      id: "fldKEpic",
      name: "Epic",
      type: "link",
      options: {
        relationship: "manyOne",
        foreignTableId: "tblEpics",
        lookupFieldId: "fldEName",
        symmetricFieldId: "fldETasks",
        fkHostTableName: "bse1.tblKanban",
      },
    },
    {
      id: "fldKUser",
      name: "User",
      type: "link",
      options: {
        relationship: "manyOne",
        foreignTableId: "tblUsers",
        lookupFieldId: "fldUName",
        isOneWay: true,
      },
    },
  ],
  tblEpics: [
    { id: "fldEName", name: "Nom", type: "singleLineText", options: {} },
    {
      id: "fldETasks",
      name: "Tâches",
      type: "link",
      description: "Les cartes de l’epic",
      options: {
        relationship: "oneMany",
        foreignTableId: "tblKanban",
        lookupFieldId: "fldKName",
        symmetricFieldId: "fldKEpic",
      },
    },
  ],
};

/** What Teable's table duplication answers: links to other tables made one-way. */
const duplicates: Record<string, object> = {
  tblKanban: {
    id: "tblKanban2",
    fieldMap: {
      fldKName: "fldK2Name",
      fldKEpic: "fldK2Epic",
      fldKEpicName: "fldK2EpicName",
      fldKUser: "fldK2User",
    },
    viewMap: { viwKBoard: "viwK2Board" },
    fields: [
      { id: "fldK2Name", name: "Nom", type: "singleLineText", options: {} },
      {
        id: "fldK2Epic",
        name: "Epic",
        type: "link",
        options: {
          relationship: "manyOne",
          foreignTableId: "tblEpics",
          lookupFieldId: "fldEName",
          isOneWay: true,
        },
      },
      {
        id: "fldK2EpicName",
        name: "Nom de l’epic",
        type: "singleLineText",
        isLookup: true,
        options: {},
        lookupOptions: {
          foreignTableId: "tblEpics",
          linkFieldId: "fldK2Epic",
          lookupFieldId: "fldEName",
          relationship: "manyOne",
          fkHostTableName: "bse1.tblKanban2",
          selfKeyName: "__id",
          foreignKeyName: "__fk_fldK2Epic",
        },
      },
      {
        id: "fldK2User",
        name: "User",
        type: "link",
        options: {
          relationship: "manyOne",
          foreignTableId: "tblUsers",
          lookupFieldId: "fldUName",
          isOneWay: true,
        },
      },
    ],
  },
  tblEpics: {
    id: "tblEpics2",
    fieldMap: {
      fldEName: "fldE2Name",
      fldETasks: "fldE2Tasks",
      fldECount: "fldE2Count",
    },
    viewMap: { viwETimeline: "viwE2Timeline" },
    fields: [
      { id: "fldE2Name", name: "Nom", type: "singleLineText", options: {} },
      {
        id: "fldE2Tasks",
        name: "Tâches",
        type: "link",
        options: {
          relationship: "oneMany",
          foreignTableId: "tblKanban",
          lookupFieldId: "fldKName",
          isOneWay: true,
        },
      },
      {
        id: "fldE2Count",
        name: "Nombre de cartes",
        type: "rollup",
        options: { expression: "countall({values})" },
        lookupOptions: {
          foreignTableId: "tblKanban",
          linkFieldId: "fldE2Tasks",
          lookupFieldId: "fldKName",
        },
      },
    ],
  },
};

interface SeenRequest {
  method: string;
  path: string;
  body: unknown;
}

/** Answers Teable: tokens, fields, duplication, conversions, deletes, renames. */
function teableHandlers(options: { failConvert?: string } = {}) {
  const seen: SeenRequest[] = [];
  server.use(
    http.post(`${teable}/api/galadrim/token`, () =>
      HttpResponse.json({
        userId: "usrAda",
        token: "token-1",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
    ),
    http.get(`${teable}/api/table/:tableId/field`, ({ params }) =>
      HttpResponse.json(sourceFields[String(params.tableId)] ?? [])
    ),
    http.post(
      `${teable}/api/base/:baseId/table/:tableId/duplicate`,
      async ({ request, params }) => {
        seen.push({
          method: "POST",
          path: `duplicate ${String(params.tableId)}`,
          body: await request.json(),
        });
        return HttpResponse.json(duplicates[String(params.tableId)]);
      }
    ),
    http.put(
      `${teable}/api/table/:tableId/field/:fieldId/convert`,
      async ({ request, params }) => {
        const body = await request.json();
        const fieldId = String(params.fieldId);
        seen.push({ method: "PUT", path: `convert ${fieldId}`, body });
        if (fieldId === options.failConvert) {
          return HttpResponse.json({ message: "invalid" }, { status: 400 });
        }
        return HttpResponse.json({
          id: fieldId,
          name: "converted",
          type: "link",
          options:
            fieldId === "fldK2Epic" ? { symmetricFieldId: "fldE2Sym" } : {},
        });
      }
    ),
    http.delete(`${teable}/api/table/:tableId/field/:fieldId`, ({ params }) => {
      seen.push({
        method: "DELETE",
        path: `${String(params.tableId)} ${String(params.fieldId)}`,
        body: null,
      });
      return new HttpResponse(null, { status: 200 });
    }),
    http.patch(
      `${teable}/api/table/:tableId/field/:fieldId`,
      async ({ request, params }) => {
        seen.push({
          method: "PATCH",
          path: `${String(params.tableId)} ${String(params.fieldId)}`,
          body: await request.json(),
        });
        return new HttpResponse(null, { status: 200 });
      }
    )
  );
  return seen;
}

function buildDuplicator() {
  return new TeableTablesDuplicator(
    new TeableClient(teable, "outline"),
    new TeableIdentity(new TeableClient(teable), secret)
  );
}

const input = {
  externalBaseId: "bse1",
  tables: [
    { externalTableId: "tblKanban", name: "Suivi Kanban" },
    { externalTableId: "tblEpics", name: "Epics" },
  ],
  withRecords: false,
};

beforeEach(async () => {
  await Redis.defaultClient.flushall();
});

describe("TeableTablesDuplicator", () => {
  it("duplicates the tables and links the copies to each other", async () => {
    const seen = teableHandlers();

    const copies = await buildDuplicator().duplicateTables(actor, input);

    expect(seen.filter((item) => item.method === "POST")).toEqual([
      {
        method: "POST",
        path: "duplicate tblKanban",
        body: { name: "Suivi Kanban", includeRecords: false },
      },
      {
        method: "POST",
        path: "duplicate tblEpics",
        body: { name: "Epics", includeRecords: false },
      },
    ]);

    const converts = seen.filter((item) => item.method === "PUT");
    expect(converts).toEqual([
      {
        method: "PUT",
        path: "convert fldK2Epic",
        body: {
          type: "link",
          options: {
            relationship: "manyOne",
            lookupFieldId: "fldE2Name",
            foreignTableId: "tblEpics2",
            isOneWay: false,
          },
        },
      },
      {
        method: "PUT",
        path: "convert fldK2EpicName",
        body: {
          type: "singleLineText",
          isLookup: true,
          lookupOptions: {
            foreignTableId: "tblEpics2",
            lookupFieldId: "fldE2Name",
            linkFieldId: "fldK2Epic",
          },
        },
      },
      {
        method: "PUT",
        path: "convert fldE2Count",
        body: {
          type: "rollup",
          options: { expression: "countall({values})" },
          lookupOptions: {
            foreignTableId: "tblKanban2",
            lookupFieldId: "fldK2Name",
            linkFieldId: "fldE2Sym",
          },
        },
      },
    ]);

    expect(seen.filter((item) => item.method === "DELETE")).toEqual([
      { method: "DELETE", path: "tblEpics2 fldE2Tasks", body: null },
    ]);
    expect(seen.filter((item) => item.method === "PATCH")).toEqual([
      {
        method: "PATCH",
        path: "tblEpics2 fldE2Sym",
        body: { name: "Tâches", description: "Les cartes de l’epic" },
      },
    ]);

    expect(copies).toEqual([
      {
        sourceTableId: "tblKanban",
        externalTableId: "tblKanban2",
        fieldIds: {
          fldKName: "fldK2Name",
          fldKEpic: "fldK2Epic",
          fldKEpicName: "fldK2EpicName",
          fldKUser: "fldK2User",
        },
        viewIds: { viwKBoard: "viwK2Board" },
      },
      {
        sourceTableId: "tblEpics",
        externalTableId: "tblEpics2",
        fieldIds: {
          fldEName: "fldE2Name",
          fldETasks: "fldE2Sym",
          fldECount: "fldE2Count",
        },
        viewIds: { viwETimeline: "viwE2Timeline" },
      },
    ]);
  });

  it("copies the records when asked", async () => {
    const seen = teableHandlers();

    await buildDuplicator().duplicateTables(actor, {
      ...input,
      tables: [input.tables[0]],
      withRecords: true,
    });

    expect(seen[0].body).toEqual({
      name: "Suivi Kanban",
      includeRecords: true,
    });
    expect(seen.filter((item) => item.method === "PUT")).toEqual([]);
  });

  it("keeps a field on the original table when Teable refuses to repoint it", async () => {
    const seen = teableHandlers({ failConvert: "fldK2Epic" });

    const copies = await buildDuplicator().duplicateTables(actor, input);

    expect(seen.filter((item) => item.method === "DELETE")).toEqual([]);
    expect(seen.map((item) => item.path)).not.toContain(
      "convert fldK2EpicName"
    );
    expect(copies[1].fieldIds.fldETasks).toEqual("fldE2Tasks");
  });
});

import { http, HttpResponse } from "msw";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import Redis from "@server/storage/redis";
import { server } from "@server/test/msw";
import type { DatabaseUserActor } from "../DatabaseEngine";
import { TeableClient, serializeQuery } from "./TeableClient";
import { TeableEngine } from "./TeableEngine";
import { TeableIdentity } from "./TeableIdentity";
import { TeableMapper } from "./TeableMapper";

const teable = "http://teable.test";
const secret = "test-secret";
const ref = { externalBaseId: "bse1", externalTableId: "tbl1" };
const actor: DatabaseUserActor = {
  email: "ada@example.com",
  name: "Ada",
  outlineUserId: "5b1b1e5e-8c4c-4c1b-9d7e-1c7f0e5a4b3c",
};

const teableFields = [
  {
    id: "fldName",
    name: "Name",
    type: "singleLineText",
    options: {},
    isPrimary: true,
    cellValueType: "string",
  },
  {
    id: "fldOwner",
    name: "Owner",
    type: "user",
    options: { isMultiple: false },
    cellValueType: "string",
  },
  {
    id: "fldFiles",
    name: "Files",
    type: "attachment",
    options: {},
    cellValueType: "string",
    isMultipleCellValue: true,
  },
];

/** Answers the token endpoint, counting calls and checking the secret. */
function tokenHandler(tokens: string[] = ["token-1", "token-2", "token-3"]) {
  const calls: { email: string; baseId?: string }[] = [];
  server.use(
    http.post(`${teable}/api/galadrim/token`, async ({ request }) => {
      if (request.headers.get("x-galadrim-secret") !== secret) {
        return HttpResponse.json({ message: "no" }, { status: 401 });
      }
      const body = (await request.json()) as { email: string; baseId?: string };
      calls.push(body);
      return HttpResponse.json({
        userId: "usrAda",
        token: tokens[calls.length - 1] ?? "token-n",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    })
  );
  return calls;
}

function buildEngine(origin: string | null = "tab-1") {
  const identity = new TeableIdentity(new TeableClient(teable), secret);
  return new TeableEngine(
    new TeableClient(teable, origin),
    identity,
    new TeableMapper("https://teable.example.com")
  );
}

beforeEach(async () => {
  await Redis.defaultClient.flushall();
});

describe("TeableEngine", () => {
  it("reads the schema with a cached token of the actor for the base", async () => {
    const tokenCalls = tokenHandler();
    const seen: { auth: string | null; origin: string | null }[] = [];
    server.use(
      http.get(`${teable}/api/table/tbl1/field`, ({ request }) => {
        seen.push({
          auth: request.headers.get("authorization"),
          origin: request.headers.get("x-galadrim-origin"),
        });
        return HttpResponse.json(teableFields);
      }),
      http.get(`${teable}/api/table/tbl1/view`, () =>
        HttpResponse.json([
          {
            id: "viwB",
            name: "Board",
            type: "kanban",
            order: 2,
            columnMeta: {},
          },
          { id: "viwA", name: "Grid", type: "grid", order: 1, columnMeta: {} },
        ])
      )
    );
    const engine = buildEngine();

    const schema = await engine.getSchema(actor, ref);
    await engine.getSchema(actor, ref);

    expect(tokenCalls).toEqual([
      { email: "ada@example.com", name: "Ada", baseId: "bse1" },
    ]);
    expect(seen[0]).toEqual({ auth: "Bearer token-1", origin: "tab-1" });
    expect(schema.fields[0]).toMatchObject({
      id: "fldName",
      type: DatabaseFieldType.SingleLineText,
      isPrimary: true,
      isComputed: false,
    });
    expect(schema.views.map((view) => [view.id, view.layout])).toEqual([
      ["viwA", DatabaseLayout.Table],
      ["viwB", DatabaseLayout.Board],
    ]);
  });

  it("lists records of a view with every field, the reader's query and the total", async () => {
    tokenHandler();
    let recordsUrl: URL | undefined;
    let countUrl: URL | undefined;
    server.use(
      http.get(`${teable}/api/table/tbl1/field`, () =>
        HttpResponse.json(teableFields)
      ),
      http.get(`${teable}/api/table/tbl1/record`, ({ request }) => {
        recordsUrl = new URL(request.url);
        return HttpResponse.json({
          records: [
            {
              id: "rec1",
              fields: {
                fldName: "Card",
                fldOwner: {
                  id: "usrAda",
                  title: "Ada",
                  email: "ada@example.com",
                  avatarUrl: "/api/attachments/read/avatar",
                },
                fldFiles: [
                  {
                    id: "actFile",
                    name: "spec.pdf",
                    path: "table/spec",
                    token: "tok",
                    size: 12,
                    mimetype: "application/pdf",
                    presignedUrl: "/api/attachments/read/spec",
                  },
                ],
              },
            },
          ],
        });
      }),
      http.get(
        `${teable}/api/table/tbl1/aggregation/row-count`,
        ({ request }) => {
          countUrl = new URL(request.url);
          return HttpResponse.json({ rowCount: 42 });
        }
      )
    );
    const filter = {
      conjunction: "and" as const,
      filterSet: [
        { fieldId: "fldName", operator: "contains" as const, value: "a" },
      ],
    };

    const page = await buildEngine().listRecords(actor, ref, {
      viewId: "viwA",
      filter,
      sort: { sortObjs: [{ fieldId: "fldName", order: "desc" }] },
      search: "Car",
      skip: 100,
      take: 50,
    });

    const params = recordsUrl?.searchParams;
    expect(params?.get("viewId")).toEqual("viwA");
    expect(params?.get("fieldKeyType")).toEqual("id");
    expect(params?.getAll("projection[]")).toEqual([
      "fldName",
      "fldOwner",
      "fldFiles",
    ]);
    expect(JSON.parse(params?.get("filter") ?? "")).toEqual(filter);
    expect(JSON.parse(params?.get("orderBy") ?? "")).toEqual([
      { fieldId: "fldName", order: "desc" },
    ]);
    expect(params?.getAll("search[]")).toEqual(["Car", "", "true"]);
    expect(params?.get("take")).toEqual("50");
    expect(params?.get("skip")).toEqual("100");
    expect(countUrl?.searchParams.get("viewId")).toEqual("viwA");
    expect(countUrl?.searchParams.getAll("search[]")).toEqual([
      "Car",
      "",
      "true",
    ]);
    expect(countUrl?.searchParams.get("projection[]")).toBeNull();

    expect(page.total).toEqual(42);
    expect(page.records[0].fields).toEqual({
      fldName: "Card",
      fldOwner: {
        id: "usrAda",
        title: "Ada",
        email: "ada@example.com",
        avatarUrl: "https://teable.example.com/api/attachments/read/avatar",
      },
      fldFiles: [
        {
          id: "actFile",
          name: "spec.pdf",
          mimetype: "application/pdf",
          size: 12,
          width: undefined,
          height: undefined,
          url: "https://teable.example.com/api/attachments/read/spec",
          thumbnailUrl: undefined,
          token: "tok",
          path: "table/spec",
        },
      ],
    });
  });

  it("replaces the view's filter by ignoring its query and keeping its sort", async () => {
    tokenHandler();
    let recordsUrl: URL | undefined;
    let countUrl: URL | undefined;
    server.use(
      http.get(`${teable}/api/table/tbl1/field`, () =>
        HttpResponse.json(teableFields)
      ),
      http.get(`${teable}/api/table/tbl1/view/viwA`, () =>
        HttpResponse.json({
          id: "viwA",
          name: "Grid",
          type: "grid",
          sort: {
            sortObjs: [
              { fieldId: "fldName", order: "asc" },
              { fieldId: "fldOwner", order: "desc" },
            ],
          },
        })
      ),
      http.get(`${teable}/api/table/tbl1/record`, ({ request }) => {
        recordsUrl = new URL(request.url);
        return HttpResponse.json({ records: [] });
      }),
      http.get(
        `${teable}/api/table/tbl1/aggregation/row-count`,
        ({ request }) => {
          countUrl = new URL(request.url);
          return HttpResponse.json({ rowCount: 0 });
        }
      )
    );

    await buildEngine().listRecords(actor, ref, {
      viewId: "viwA",
      filter: { conjunction: "and", filterSet: [] },
      replaceFilter: true,
      sort: { sortObjs: [{ fieldId: "fldName", order: "desc" }] },
      skip: 0,
      take: 10,
    });

    expect(recordsUrl?.searchParams.get("ignoreViewQuery")).toEqual("true");
    expect(countUrl?.searchParams.get("ignoreViewQuery")).toEqual("true");
    expect(JSON.parse(recordsUrl?.searchParams.get("orderBy") ?? "")).toEqual([
      { fieldId: "fldName", order: "desc" },
      { fieldId: "fldOwner", order: "desc" },
    ]);
  });

  it("clears view options with null, the frozen field with an empty id", async () => {
    tokenHandler();
    let optionsBody: unknown;
    server.use(
      http.patch(
        `${teable}/api/table/tbl1/view/viwA/options`,
        async ({ request }) => {
          optionsBody = await request.json();
          return new HttpResponse(null, { status: 200 });
        }
      ),
      http.get(`${teable}/api/table/tbl1/view/viwA`, () =>
        HttpResponse.json({ id: "viwA", name: "Grid", type: "grid" })
      )
    );

    await buildEngine().updateView(actor, ref, "viwA", {
      options: { coverFieldId: null, frozenFieldId: null },
    });

    expect(optionsBody).toEqual({
      options: { coverFieldId: null, frozenFieldId: "" },
    });
  });

  it("duplicates a field under the source's name", async () => {
    tokenHandler();
    let duplicateBody: unknown;
    server.use(
      http.get(`${teable}/api/table/tbl1/field/fldName`, () =>
        HttpResponse.json(teableFields[0])
      ),
      http.post(
        `${teable}/api/table/tbl1/field/fldName/duplicate`,
        async ({ request }) => {
          duplicateBody = await request.json();
          return HttpResponse.json({
            ...teableFields[0],
            id: "fldCopy",
            name: "Name 2",
            isPrimary: false,
          });
        }
      )
    );

    const field = await buildEngine().duplicateField(actor, ref, "fldName", {
      viewId: "viwA",
    });

    expect(duplicateBody).toEqual({ name: "Name", viewId: "viwA" });
    expect(field).toMatchObject({ id: "fldCopy", isPrimary: false });
  });

  it("asks for a new token once when Teable refuses the cached one", async () => {
    const tokenCalls = tokenHandler(["stale", "fresh"]);
    server.use(
      http.get(`${teable}/api/table/tbl1/record/rec1`, ({ request }) =>
        request.headers.get("authorization") === "Bearer fresh"
          ? HttpResponse.json({ id: "rec1", fields: { fldName: "Card" } })
          : HttpResponse.json({ message: "expired" }, { status: 401 })
      )
    );

    const record = await buildEngine().getRecord(actor, ref, "rec1");

    expect(record.fields.fldName).toEqual("Card");
    expect(tokenCalls).toHaveLength(2);
  });

  it.each([
    [403, 403],
    [404, 404],
    [400, 400],
    [422, 400],
    [500, 500],
  ])("maps a Teable %i to an Outline %i", async (teableStatus, status) => {
    tokenHandler();
    server.use(
      http.get(`${teable}/api/table/tbl1/record/rec1`, () =>
        HttpResponse.json({ message: "nope" }, { status: teableStatus })
      )
    );

    await expect(
      buildEngine().getRecord(actor, ref, "rec1")
    ).rejects.toMatchObject({ status });
  });

  it("writes people by id with typecast and checks they were kept", async () => {
    tokenHandler();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${teable}/api/table/tbl1/record`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          records: [{ id: "rec1", fields: { fldName: "Card" } }],
        });
      })
    );

    await expect(
      buildEngine().createRecord(actor, ref, {
        fields: {
          fldName: "Card",
          fldOwner: [{ id: "usrBob", title: "Bob", email: "bob@example.com" }],
        },
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(body).toEqual({
      fieldKeyType: "id",
      typecast: true,
      records: [{ fields: { fldName: "Card", fldOwner: [{ id: "usrBob" }] } }],
    });
  });

  it("moves records: cells first, then the order in the view", async () => {
    tokenHandler();
    const steps: string[] = [];
    let orderBody: unknown;
    let fetchUrl: URL | undefined;
    server.use(
      http.patch(`${teable}/api/table/tbl1/record`, async ({ request }) => {
        steps.push("patch");
        expect(await request.json()).toEqual({
          fieldKeyType: "id",
          typecast: true,
          records: [
            { id: "rec1", fields: { fldStatus: "Done" } },
            { id: "rec2", fields: { fldStatus: "Done" } },
          ],
        });
        return HttpResponse.json([]);
      }),
      http.put(
        `${teable}/api/table/tbl1/view/viwB/record-order`,
        async ({ request }) => {
          steps.push("order");
          orderBody = await request.json();
          return new HttpResponse(null, { status: 200 });
        }
      ),
      http.get(`${teable}/api/table/tbl1/field`, () =>
        HttpResponse.json(teableFields)
      ),
      http.get(`${teable}/api/table/tbl1/record`, ({ request }) => {
        fetchUrl = new URL(request.url);
        return HttpResponse.json({
          records: [
            { id: "rec1", fields: { fldStatus: "Done" } },
            { id: "rec2", fields: { fldStatus: "Done" } },
          ],
        });
      })
    );

    const records = await buildEngine().moveRecords(actor, ref, {
      viewId: "viwB",
      recordIds: ["rec1", "rec2"],
      anchorId: "rec9",
      position: "after",
      fields: { fldStatus: "Done" },
    });

    expect(steps).toEqual(["patch", "order"]);
    expect(orderBody).toEqual({
      anchorId: "rec9",
      position: "after",
      recordIds: ["rec1", "rec2"],
    });
    expect(fetchUrl?.searchParams.getAll("selectedRecordIds[]")).toEqual([
      "rec1",
      "rec2",
    ]);
    expect(records).toHaveLength(2);
  });

  it("computes statistics grouped by function", async () => {
    tokenHandler();
    let url: URL | undefined;
    server.use(
      http.get(`${teable}/api/table/tbl1/aggregation`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({
          aggregations: [
            { fieldId: "fldA", total: { value: 3, aggFunc: "filled" } },
            { fieldId: "fldB", total: null },
          ],
        });
      })
    );

    const result = await buildEngine().aggregate(actor, ref, {
      viewId: "viwA",
      fieldStats: { fldA: "filled", fldB: "sum", fldC: "sum" },
    });

    expect(url?.searchParams.getAll("field[filled][]")).toEqual(["fldA"]);
    expect(url?.searchParams.getAll("field[sum][]")).toEqual(["fldB", "fldC"]);
    expect(result).toEqual({ fldA: { value: 3 }, fldB: { value: null } });
  });

  it("creates a base in the service space and a table with its first view", async () => {
    const tokenCalls = tokenHandler(["service", "ada"]);
    let baseBody: unknown;
    let tableBody:
      | {
          fields: { id: string; name: string }[];
          views: { type: string; options?: { stackFieldId?: string } }[];
          records: unknown[];
        }
      | undefined;
    server.use(
      http.post(`${teable}/api/galadrim/space`, ({ request }) =>
        request.headers.get("x-galadrim-secret") === secret
          ? HttpResponse.json({ spaceId: "spcOutline" })
          : HttpResponse.json({}, { status: 401 })
      ),
      http.post(`${teable}/api/base`, async ({ request }) => {
        baseBody = await request.json();
        return HttpResponse.json({ id: "bseNew", name: "Delisle" });
      }),
      http.post(`${teable}/api/base/bseNew/table/`, async ({ request }) => {
        tableBody = (await request.json()) as typeof tableBody;
        return HttpResponse.json({
          id: "tblNew",
          name: "Kanban",
          fields: tableBody?.fields.map((field, index) => ({
            ...field,
            type: index ? "singleSelect" : "singleLineText",
            isPrimary: index === 0,
            cellValueType: "string",
          })),
          views: [{ id: "viwNew", name: "Board", type: "kanban", order: 0 }],
        });
      })
    );
    const engine = buildEngine();

    const baseId = await engine.createBase("Delisle");
    const table = await engine.createTable(actor, baseId, {
      name: "Kanban",
      fields: [
        { key: "name", name: "Name", type: DatabaseFieldType.SingleLineText },
        {
          key: "status",
          name: "Status",
          type: DatabaseFieldType.SingleSelect,
          options: { choices: [{ name: "To do", color: "grayBright" }] },
        },
      ],
      view: {
        name: "Board",
        layout: DatabaseLayout.Board,
        stackFieldKey: "status",
      },
    });

    expect(tokenCalls).toEqual([
      { email: "outline@galadrim.local", name: "Outline" },
      { email: "ada@example.com", name: "Ada", baseId: "bseNew" },
    ]);
    expect(baseBody).toEqual({ spaceId: "spcOutline", name: "Delisle" });
    expect(table.fieldIds.name).toMatch(/^fld[0-9a-zA-Z]{16}$/);
    expect(tableBody?.fields[1].id).toEqual(table.fieldIds.status);
    expect(tableBody?.views[0]).toEqual({
      name: "Board",
      type: "kanban",
      options: { stackFieldId: table.fieldIds.status },
    });
    expect(tableBody?.records).toEqual([]);
    expect(table.externalTableId).toEqual("tblNew");
    expect(table.views[0].layout).toEqual(DatabaseLayout.Board);
  });

  it("makes sure people exist in Teable", async () => {
    server.use(
      http.post(`${teable}/api/galadrim/users/ensure`, async ({ request }) => {
        expect(request.headers.get("x-galadrim-secret")).toEqual(secret);
        const body = (await request.json()) as {
          users: { email: string }[];
        };
        return HttpResponse.json({
          users: body.users.map((user, index) => ({
            email: user.email.toLowerCase(),
            id: `usr${index}`,
          })),
        });
      })
    );

    const ids = await buildEngine().ensureUsers([
      { email: "Bob@Example.com", name: "Bob" },
    ]);

    expect(ids.get("bob@example.com")).toEqual("usr0");
  });
});

describe("serializeQuery", () => {
  it("writes arrays and objects the way qs reads them", () => {
    expect(
      serializeQuery({
        a: ["x", ""],
        b: { sum: ["f1"] },
        c: undefined,
        d: 2,
      })
    ).toEqual("?a%5B%5D=x&a%5B%5D=&b%5Bsum%5D%5B%5D=f1&d=2");
  });
});

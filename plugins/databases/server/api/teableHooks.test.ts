import { randomUUID } from "node:crypto";
import type { MockInstance } from "vitest";
import { Event } from "@server/models";
import { buildDatabase, buildTeam, buildUser } from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import env from "../env";

const server = getTestServer();

/** Tables are shared by every test run on the database: each test takes its own. */
const tableId = () => `tbl${randomUUID().replace(/-/g, "").slice(0, 16)}`;

const receive = (body: object, secret = env.GALADRIM_SECRET) =>
  server.post("/api/teableHooks.receive", {
    body,
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });

describe("#teableHooks.receive", () => {
  let schedule: MockInstance<typeof Event.schedule>;

  const databaseChanges = () =>
    schedule.mock.calls
      .map(([event]) => event)
      .filter((event) => event.name === "databases.change");

  beforeEach(() => {
    schedule = vi
      .spyOn(Event, "schedule")
      .mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    schedule.mockRestore();
  });

  it("refuses a request without the secret", async () => {
    const res = await receive({ tableId: "tbl1", events: [] }, "");
    expect(res.status).toEqual(401);
  });

  it("refuses a wrong secret", async () => {
    const res = await receive({ tableId: "tbl1", events: [] }, "not-it");
    expect(res.status).toEqual(401);
    expect(databaseChanges()).toHaveLength(0);
  });

  it("ignores tables without a database", async () => {
    const res = await receive({
      tableId: tableId(),
      events: [{ kind: "record.update", recordIds: ["rec1"] }],
      actor: null,
      origin: null,
    });
    expect(res.status).toEqual(200);
    expect(databaseChanges()).toHaveLength(0);
  });

  it("ignores tables moved to the Outline engine", async () => {
    const moved = tableId();
    await buildDatabase({ externalTableId: moved, engine: "outline" });

    const res = await receive({
      tableId: moved,
      events: [{ kind: "record.update", recordIds: ["rec1"] }],
      actor: null,
      origin: null,
    });

    expect(res.status).toEqual(200);
    expect(databaseChanges()).toHaveLength(0);
  });

  it("sends one change per database of the table, with the actor of its team", async () => {
    const shared = tableId();
    const teamA = await buildTeam();
    const teamB = await buildTeam();
    const author = await buildUser({ teamId: teamA.id });
    const databaseA = await buildDatabase({
      teamId: teamA.id,
      externalTableId: shared,
    });
    const databaseB = await buildDatabase({
      teamId: teamB.id,
      externalTableId: shared,
    });

    const res = await receive({
      tableId: shared,
      events: [
        {
          kind: "record.update",
          recordIds: ["rec1"],
          fieldIds: ["fldName"],
          changes: [
            {
              recordId: "rec1",
              fieldId: "fldName",
              before: "Old",
              after: "New",
            },
          ],
        },
        { kind: "view", viewIds: ["viwBoard"] },
      ],
      actor: { id: "usrAuthor", email: author.email?.toUpperCase() },
      origin: "tab-1",
    });

    expect(res.status).toEqual(200);
    expect(databaseChanges()).toHaveLength(2);
    const byModel = new Map(
      databaseChanges().map((event) => [event.modelId, event])
    );
    expect(byModel.get(databaseA.id)).toMatchObject({
      name: "databases.change",
      teamId: teamA.id,
      actorId: author.id,
      collectionId: databaseA.collectionId,
      data: {
        kinds: ["record.update", "view"],
        recordIds: ["rec1"],
        fieldIds: ["fldName"],
        viewIds: ["viwBoard"],
        origin: "tab-1",
        changes: [
          { recordId: "rec1", fieldId: "fldName", before: "Old", after: "New" },
        ],
      },
    });
    expect(byModel.get(databaseB.id)).toMatchObject({
      teamId: teamB.id,
      actorId: "",
    });
  });

  it("drops record ids beyond what readers can reload one by one", async () => {
    const busy = tableId();
    await buildDatabase({ externalTableId: busy });
    const recordIds = Array.from({ length: 600 }, (_, i) => `rec${i}`);

    await receive({
      tableId: busy,
      events: [{ kind: "record.create", recordIds }],
      actor: null,
      origin: null,
    });

    const [event] = databaseChanges();
    expect(event.data?.recordIds).toBeUndefined();
    expect(event.data?.kinds).toEqual(["record.create"]);
  });
});

import type { DatabaseRecord } from "@shared/databases/types";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import {
  evaluateFilter,
  insertIds,
  isEmptyCell,
  toOptimisticValue,
} from "./DatabaseRecordsStore";

const databaseId = "0c440212-8b40-49fa-8a64-2548d6b60d59";
const viewId = "viwBoard";
const status = "fldStatus";

const record = (id: string, value: string | null): DatabaseRecord => ({
  id,
  fields: { [status]: value },
});

const column = (value: string | null) => ({
  extraFilter: {
    conjunction: "and" as const,
    filterSet: [
      value === null
        ? { fieldId: status, operator: "isEmpty" as const, value: null }
        : { fieldId: status, operator: "is" as const, value },
    ],
  },
});

/** Answers `databaseRecords.list` with the rows matching the column filter. */
function mockList(rows: DatabaseRecord[]) {
  vi.mocked(client.post).mockImplementation(((path: string, body: never) => {
    if (path === "/databaseRecords.list") {
      const { filter } = body as {
        filter?: Parameters<typeof evaluateFilter>[0];
      };
      const data = rows.filter((row) => evaluateFilter(filter, row));
      return Promise.resolve({
        data,
        pagination: { offset: 0, limit: 100, total: data.length },
      });
    }
    return Promise.resolve({ data: {} });
  }) as never);
}

describe("evaluateFilter", () => {
  it("decides the operators of board columns", () => {
    expect(evaluateFilter(column("A").extraFilter, record("r", "A"))).toBe(
      true
    );
    expect(evaluateFilter(column("A").extraFilter, record("r", "B"))).toBe(
      false
    );
    expect(evaluateFilter(column(null).extraFilter, record("r", null))).toBe(
      true
    );
    expect(evaluateFilter(column(null).extraFilter, record("r", "A"))).toBe(
      false
    );
    expect(evaluateFilter(null, record("r", "A"))).toBe(true);
  });

  it("leaves other operators to the engine", () => {
    expect(
      evaluateFilter(
        {
          conjunction: "and",
          filterSet: [{ fieldId: status, operator: "isWithIn", value: null }],
        },
        record("r", "A")
      )
    ).toBeUndefined();
  });

  it("combines with and / or", () => {
    const or = {
      conjunction: "or" as const,
      filterSet: [column("A").extraFilter, column("B").extraFilter],
    };
    expect(evaluateFilter(or, record("r", "B"))).toBe(true);
    expect(evaluateFilter(or, record("r", "C"))).toBe(false);
  });
});

describe("helpers", () => {
  it("inserts ids next to an anchor", () => {
    expect(insertIds(["a", "b", "c"], ["x"], "b", "before")).toEqual([
      "a",
      "x",
      "b",
      "c",
    ]);
    expect(insertIds(["a", "b"], ["x"], "b", "after")).toEqual(["a", "b", "x"]);
    expect(insertIds(["a", "x", "b"], ["x"])).toEqual(["a", "b", "x"]);
  });

  it("tells empty cells", () => {
    expect(isEmptyCell(null)).toBe(true);
    expect(isEmptyCell("")).toBe(true);
    expect(isEmptyCell([])).toBe(true);
    expect(isEmptyCell(0)).toBe(false);
  });

  it("shows written people before the server answers", () => {
    const value = toOptimisticValue([{ outlineUserId: "u1" }], () => ({
      name: "Ada",
    }));
    expect(value).toEqual([
      { id: "u1", title: "Ada", avatarUrl: null, outlineUserId: "u1" },
    ]);
    expect(toOptimisticValue("text", () => ({ name: "" }))).toBe("text");
  });
});

describe("DatabaseRecordsStore", () => {
  beforeEach(() => {
    stores.databaseRecords.clear();
    vi.mocked(client.post).mockReset();
  });

  it("returns the same query for the same arguments", () => {
    const a = stores.databaseRecords.query(databaseId, viewId, column("A"));
    const b = stores.databaseRecords.query(databaseId, viewId, column("A"));
    const c = stores.databaseRecords.query(databaseId, viewId, column("B"));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("loads a page of rows", async () => {
    mockList([record("r1", "A"), record("r2", "B"), record("r3", "A")]);
    const query = stores.databaseRecords.query(databaseId, viewId, column("A"));
    await query.fetch();

    expect(query.recordIds).toEqual(["r1", "r3"]);
    expect(query.total).toBe(2);
    expect(query.hasMore).toBe(false);
    expect(stores.databaseRecords.recordById(databaseId, "r3")).toBeDefined();
  });

  it("moves a card between columns at once, and back when refused", async () => {
    mockList([record("r1", "A"), record("r2", "A"), record("r3", "B")]);
    const columnA = stores.databaseRecords.query(
      databaseId,
      viewId,
      column("A")
    );
    const columnB = stores.databaseRecords.query(
      databaseId,
      viewId,
      column("B")
    );
    await Promise.all([columnA.fetch(), columnB.fetch()]);

    let reject: (err: Error) => void = () => undefined;
    vi.mocked(client.post).mockImplementation(
      (() =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })) as never
    );

    const move = stores.databaseRecords.move(databaseId, viewId, {
      recordIds: ["r1"],
      anchorId: "r3",
      position: "before",
      fields: { [status]: "B" },
    });

    expect(columnA.recordIds).toEqual(["r2"]);
    expect(columnB.recordIds).toEqual(["r1", "r3"]);
    expect(columnB.total).toBe(2);
    expect(
      stores.databaseRecords.recordById(databaseId, "r1")?.fields[status]
    ).toBe("B");

    reject(new Error("refused"));
    await expect(move).rejects.toThrow("refused");

    expect(columnA.recordIds).toEqual(["r1", "r2"]);
    expect(columnB.recordIds).toEqual(["r3"]);
    expect(
      stores.databaseRecords.recordById(databaseId, "r1")?.fields[status]
    ).toBe("A");
  });

  it("moves an edited card to the column of its new value", async () => {
    mockList([record("r1", "A"), record("r3", "B")]);
    const columnA = stores.databaseRecords.query(
      databaseId,
      viewId,
      column("A")
    );
    const columnB = stores.databaseRecords.query(
      databaseId,
      viewId,
      column("B")
    );
    await Promise.all([columnA.fetch(), columnB.fetch()]);

    vi.mocked(client.post).mockResolvedValue({ data: record("r1", "B") });
    await stores.databaseRecords.update(databaseId, "r1", { [status]: "B" });

    expect(columnA.recordIds).toEqual([]);
    expect(columnB.recordIds).toEqual(["r1", "r3"]);
  });

  it("reloads the queries of a view whose cards another person moved", async () => {
    mockList([record("r1", "A")]);
    const board = stores.databaseRecords.query(databaseId, viewId, column("A"));
    const other = stores.databaseRecords.query(databaseId, "viwTable");
    await Promise.all([board.fetch(), other.fetch()]);
    const boardInvalidate = vi.spyOn(board, "invalidate");
    const otherInvalidate = vi.spyOn(other, "invalidate");

    stores.databaseRecords.handleChange({
      databaseId,
      kinds: ["view"],
      viewIds: [viewId],
      actorId: "someone-else",
    });

    expect(boardInvalidate).toHaveBeenCalled();
    expect(otherInvalidate).not.toHaveBeenCalled();
  });

  it("ignores the echo of its own move", async () => {
    mockList([record("r1", "A")]);
    const board = stores.databaseRecords.query(databaseId, viewId, column("A"));
    await board.fetch();
    stores.auth.currentUserId = "me";

    vi.mocked(client.post).mockResolvedValue({ data: [record("r1", "A")] });
    await stores.databaseRecords.move(databaseId, viewId, {
      recordIds: ["r1"],
    });
    const invalidate = vi.spyOn(board, "invalidate");

    stores.databaseRecords.handleChange({
      databaseId,
      kinds: ["view"],
      viewIds: [viewId],
      actorId: "me",
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

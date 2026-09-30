import type {
  DatabaseGroupPoint,
  DatabaseRecord,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { buildDisplayRows, dropSide, pathChange, pathPrefill } from "./rows";
import { makeField } from "./testFixtures";

const record = (id: string, status: string | null = null): DatabaseRecord => ({
  id,
  fields: { status },
});

const status = makeField({
  id: "status",
  type: DatabaseFieldType.SingleSelect,
  options: {
    choices: [
      { name: "A", color: "blue" },
      { name: "B", color: "red" },
    ],
  },
});
const group = [{ fieldId: "status", order: "asc" as const }];
const points: DatabaseGroupPoint[] = [
  { type: "header", id: "gA", depth: 0, value: "A", isCollapsed: false },
  { type: "row", count: 2 },
  { type: "header", id: "gB", depth: 0, value: "B", isCollapsed: false },
  { type: "row", count: 1 },
];
const records = [record("r1", "A"), record("r2", "A"), record("r3", "B")];

describe("buildDisplayRows", () => {
  it("lists rows as they are without grouping", () => {
    expect(buildDisplayRows({ records }).map((row) => row.key)).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
  });

  it("hands rows out to their groups with counts", () => {
    const rows = buildDisplayRows({ records, points, group, canCreate: true });
    expect(rows.map((row) => row.type)).toEqual([
      "group",
      "record",
      "record",
      "add",
      "group",
      "record",
      "add",
    ]);
    const header = rows[0];
    expect(header.type === "group" && header.count).toBe(2);
    const last = rows[5];
    expect(last.type === "record" && last.path).toEqual([
      { fieldId: "status", value: "B" },
    ]);
  });

  it("repeats the column headers and the calculations in every open group", () => {
    const rows = buildDisplayRows({
      records,
      points,
      group,
      canCreate: true,
      perGroupLines: true,
      collapsed: { gB: true },
    });
    expect(rows.map((row) => row.key)).toEqual([
      "group:gA",
      "columns:gA",
      "r1",
      "r2",
      'add:"A"',
      "calculations:gA",
      "group:gB",
    ]);
  });

  it("closes a group with its calculations only once its rows are loaded", () => {
    const rows = buildDisplayRows({
      records: records.slice(0, 1),
      points,
      group,
      hasMore: true,
      perGroupLines: true,
    });
    expect(rows.map((row) => row.type)).toEqual(["group", "columns", "record"]);
  });

  it("repeats the lines in the groups of the last level only", () => {
    const nested: DatabaseGroupPoint[] = [
      { type: "header", id: "g1", depth: 0, value: "A", isCollapsed: false },
      { type: "header", id: "g1a", depth: 1, value: "x", isCollapsed: false },
      { type: "row", count: 3 },
    ];
    const rows = buildDisplayRows({
      records,
      points: nested,
      group: [...group, { fieldId: "other", order: "asc" }],
      perGroupLines: true,
    });
    expect(rows.map((row) => row.key)).toEqual([
      "group:g1",
      "group:g1a",
      "columns:g1a",
      "r1",
      "r2",
      "r3",
      "calculations:g1a",
    ]);
  });

  it("skips the rows of folded groups", () => {
    const rows = buildDisplayRows({
      records,
      points,
      group,
      collapsed: { gA: true },
    });
    expect(rows.map((row) => row.key)).toEqual(["group:gA", "group:gB", "r3"]);
  });

  it("stops where loaded rows stop", () => {
    const rows = buildDisplayRows({
      records: records.slice(0, 1),
      points,
      group,
      hasMore: true,
      canCreate: true,
    });
    expect(rows.map((row) => row.key)).toEqual(["group:gA", "r1"]);
  });

  it("counts nested groups", () => {
    const nested: DatabaseGroupPoint[] = [
      { type: "header", id: "g1", depth: 0, value: "A", isCollapsed: false },
      { type: "header", id: "g1a", depth: 1, value: "x", isCollapsed: false },
      { type: "row", count: 1 },
      { type: "header", id: "g1b", depth: 1, value: "y", isCollapsed: false },
      { type: "row", count: 2 },
    ];
    const rows = buildDisplayRows({
      records,
      points: nested,
      group: [...group, { fieldId: "other", order: "asc" }],
    });
    const top = rows[0];
    expect(top.type === "group" && top.count).toBe(3);
    const folded = buildDisplayRows({
      records,
      points: nested,
      group: [...group, { fieldId: "other", order: "asc" }],
      collapsed: { g1: true },
    });
    expect(folded.map((row) => row.key)).toEqual(["group:g1"]);
  });
});

describe("group paths", () => {
  const fieldById = (id: string) => (id === "status" ? status : undefined);

  it("prefills the group values of a path", () => {
    expect(pathPrefill([{ fieldId: "status", value: "B" }], fieldById)).toEqual(
      {
        status: "B",
      }
    );
    expect(
      pathPrefill([{ fieldId: "status", value: null }], fieldById)
    ).toEqual({
      status: null,
    });
    expect(
      pathPrefill([{ fieldId: "missing", value: "B" }], fieldById)
    ).toEqual({});
  });

  it("writes only the levels that change", () => {
    const from = [{ fieldId: "status", value: "A" }];
    expect(pathChange(from, from, fieldById)).toBeUndefined();
    expect(
      pathChange(from, [{ fieldId: "status", value: "B" }], fieldById)
    ).toEqual({ status: "B" });
  });
});

describe("dropSide", () => {
  it("drops before above the middle, after below", () => {
    expect(dropSide(105, { top: 100, height: 40 })).toBe("before");
    expect(dropSide(125, { top: 100, height: 40 })).toBe("after");
  });
});

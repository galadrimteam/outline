import type { DatabaseGroupPoint } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { computeBase } from "./computed/computeBase";
import { groupMembers, groupPoints, groupValue } from "./groups";
import { selectRecords } from "./select";
import {
  PARIS,
  contextAt,
  makeField,
  makeRecord,
  makeTable,
  makeView,
} from "./testFixtures";

const choices = ["Todo", "Doing", "Done"].map((name) => ({
  name,
  color: "gray",
}));
const table = makeTable(
  "tblTasks",
  [
    makeField({ id: "title", type: DatabaseFieldType.SingleLineText }),
    makeField({
      id: "status",
      type: DatabaseFieldType.SingleSelect,
      options: { choices },
    }),
    makeField({ id: "owner", type: DatabaseFieldType.User }),
    makeField({
      id: "points",
      type: DatabaseFieldType.Number,
      options: { formatting: { type: "decimal", precision: 0 } },
    }),
  ],
  [
    makeRecord("rec1", {
      status: "Doing",
      owner: { id: "u1", title: "Ada" },
      points: 1.2,
    }),
    makeRecord("rec2", {
      status: "Todo",
      owner: { id: "u2", title: "Bob" },
      points: 0.6,
    }),
    makeRecord("rec3", {
      status: "Doing",
      owner: { id: "u1", title: "Ada" },
      points: 0.8,
    }),
    makeRecord("rec4", { owner: { id: "u2", title: "Bob" } }),
    makeRecord("rec5", { status: "Doing", owner: { id: "u2", title: "Bob" } }),
  ]
);
const context = contextAt("2025-06-15T10:00:00.000Z");
const base = computeBase([table], context);

const shape = (points: DatabaseGroupPoint[]) =>
  points.map((point) =>
    point.type === "header"
      ? `${point.depth}:${JSON.stringify(point.value)}`
      : point.count
  );

describe("groupPoints", () => {
  it("gives a header per value in choice order, empty first, each followed by its count", () => {
    const group = [{ fieldId: "status", order: "asc" as const }];
    const records = selectRecords(
      table,
      base,
      { view: makeView({ id: "v", group }) },
      context
    );
    const points = groupPoints(table, records, group);
    expect(shape(points)).toEqual(["0:null", 1, '0:"Todo"', 1, '0:"Doing"', 3]);
    expect(points[0]).toMatchObject({
      type: "header",
      isCollapsed: false,
      depth: 0,
    });
    expect(records.map((record) => record.row.id)).toEqual([
      "rec4",
      "rec2",
      "rec1",
      "rec3",
      "rec5",
    ]);
  });

  it("nests levels, a header opening again under a new parent", () => {
    const group = [
      { fieldId: "status", order: "desc" as const },
      { fieldId: "owner", order: "asc" as const },
    ];
    const records = selectRecords(
      table,
      base,
      { view: makeView({ id: "v", group }) },
      context
    );
    expect(shape(groupPoints(table, records, group))).toEqual([
      '0:"Doing"',
      '1:{"id":"u1","title":"Ada"}',
      2,
      '1:{"id":"u2","title":"Bob"}',
      1,
      '0:"Todo"',
      '1:{"id":"u2","title":"Bob"}',
      1,
      "0:null",
      '1:{"id":"u2","title":"Bob"}',
      1,
    ]);
  });

  it("groups numbers at the field's precision and keeps ids stable", () => {
    const group = [{ fieldId: "points", order: "asc" as const }];
    const records = base.records("tblTasks");
    const first = groupPoints(table, records, group);
    expect(shape(first)).toEqual(["0:null", 2, "0:1", 3]);
    expect(groupPoints(table, [...records].reverse(), group)).toEqual(first);
    const ids = first.flatMap((point) =>
      point.type === "header" ? [point.id] : []
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps texts that differ only by case or accents in separate, whole groups", () => {
    const words = makeTable(
      "tblWords",
      [makeField({ id: "word", type: DatabaseFieldType.SingleLineText })],
      ["a", "A", "à", "a", "A"].map((word, index) =>
        makeRecord(`rec${index}`, { word })
      )
    );
    const records = computeBase([words], context).records("tblWords");
    const points = groupPoints(words, records, [
      { fieldId: "word", order: "asc" },
    ]);
    expect(points.filter((point) => point.type === "header")).toHaveLength(3);
    expect(
      points
        .filter((point) => point.type === "row")
        .map((point) => point.type === "row" && point.count)
    ).toEqual([2, 2, 1]);
  });

  it("gives nothing without records or known grouping fields", () => {
    expect(
      groupPoints(table, [], [{ fieldId: "status", order: "asc" }])
    ).toEqual([]);
    expect(
      groupPoints(table, base.records("tblTasks"), [
        { fieldId: "gone", order: "asc" },
      ])
    ).toEqual([]);
  });
});

describe("groupMembers", () => {
  it("gives the records of every group under the ids of the headers", () => {
    const group = [
      { fieldId: "status", order: "desc" as const },
      { fieldId: "owner", order: "asc" as const },
    ];
    const records = selectRecords(
      table,
      base,
      { view: makeView({ id: "v", group }) },
      context
    );
    const members = groupMembers(table, records, group);
    const ids = (value: string) =>
      (members.get(value) ?? []).map((record) => record.row.id);
    const headers = groupPoints(table, records, group).flatMap((point) =>
      point.type === "header" ? [point] : []
    );
    expect(headers.map((header) => ids(header.id))).toEqual([
      ["rec1", "rec3", "rec5"],
      ["rec1", "rec3"],
      ["rec5"],
      ["rec2"],
      ["rec2"],
      ["rec4"],
      ["rec4"],
    ]);
    expect(members.size).toBe(headers.length);
  });
});

describe("groupValue", () => {
  it("groups dates by day, minute, month or year in the field's zone", () => {
    const date = (time: string, preset = "YYYY-MM-DD") =>
      makeField({
        id: "d",
        type: DatabaseFieldType.Date,
        options: { formatting: { date: preset, time, timeZone: PARIS } },
      });
    const value = "2025-06-01T21:45:30.000Z";
    expect(groupValue(date("None"), value)).toBe("2025-05-31T22:00:00.000Z");
    expect(groupValue(date("HH:mm"), value)).toBe("2025-06-01T21:45:00.000Z");
    expect(groupValue(date("None", "YYYY-MM"), value)).toBe(
      "2025-05-31T22:00:00.000Z"
    );
    expect(groupValue(date("None", "YYYY"), value)).toBe(
      "2024-12-31T23:00:00.000Z"
    );
  });

  it("groups lists as a whole and links by id and title", () => {
    const tags = makeField({ id: "t", type: DatabaseFieldType.MultipleSelect });
    expect(groupValue(tags, ["a", "b"])).toEqual(["a", "b"]);
    expect(groupValue(tags, [])).toBeNull();
    const link = makeField({ id: "l", type: DatabaseFieldType.Link });
    expect(groupValue(link, [{ id: "r1", title: "One" }])).toEqual([
      { id: "r1", title: "One" },
    ]);
  });
});

import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseRecord,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { groupPrefill, groupRecords, groupValues } from "./grouping";

function field(patch: Partial<DatabaseField>): DatabaseField {
  return {
    id: "f",
    name: "F",
    type: DatabaseFieldType.SingleLineText,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
    ...patch,
  };
}

function record(id: string, value?: DatabaseCellValue): DatabaseRecord {
  const fields: Record<string, DatabaseCellValue> = {};
  if (value !== undefined) {
    fields.f = value;
  }
  return { id, fields };
}

const status = field({
  type: DatabaseFieldType.SingleSelect,
  options: {
    choices: [
      { name: "To do", color: "grey" },
      { name: "Doing", color: "blue" },
      { name: "Done", color: "green" },
    ],
  },
});

describe("groupRecords", () => {
  it("orders select groups by their options, the empty group first", () => {
    const groups = groupRecords(
      [
        record("1", "Done"),
        record("2", "To do"),
        record("3", undefined),
        record("4", "Done"),
      ],
      status
    );
    expect(groups.map((g) => g.key)).toEqual(["", "To do", "Done"]);
    expect(groups[2].records.map((r) => r.id)).toEqual(["1", "4"]);
  });

  it("follows the order of the view's groups and leaves the folded ones out", () => {
    const records = [
      record("1", "Done"),
      record("2", "To do"),
      record("3", undefined),
      record("4", "Doing"),
    ];
    const groups = groupRecords(records, status, "asc", {
      order: ["Done", "", "To do"],
      hidden: ["To do"],
    });
    expect(groups.map((g) => g.key)).toEqual(["Done", "", "Doing"]);
    const checkbox = field({
      type: DatabaseFieldType.Checkbox,
      cellValueType: "boolean",
    });
    expect(
      groupRecords([record("1", null), record("2", true)], checkbox, "asc", {
        order: ["true", "false"],
      }).map((g) => g.key)
    ).toEqual(["true", "false"]);
  });

  it("reverses the filled groups when descending", () => {
    const groups = groupRecords(
      [record("1", "Done"), record("2", "To do"), record("3", null)],
      status,
      "desc"
    );
    expect(groups.map((g) => g.key)).toEqual(["", "Done", "To do"]);
  });

  it("puts a row in the group of each of its values", () => {
    const tags = field({
      type: DatabaseFieldType.MultipleSelect,
      isMultipleCellValue: true,
    });
    const groups = groupRecords(
      [record("1", ["a", "b"]), record("2", ["b"]), record("3", [])],
      tags
    );
    expect(groups.map((g) => [g.key, g.records.length])).toEqual([
      ["", 1],
      ["a", 1],
      ["b", 2],
    ]);
    expect(groups[1].value).toEqual(["a"]);
  });

  it("groups relations by linked record and people by user", () => {
    const link = field({
      type: DatabaseFieldType.Link,
      isMultipleCellValue: true,
    });
    const groups = groupRecords(
      [
        record("1", [
          { id: "r2", title: "Epic B" },
          { id: "r1", title: "Epic A" },
        ]),
        record("2", [{ id: "r1", title: "Epic A" }]),
      ],
      link
    );
    expect(groups.map((g) => g.label)).toEqual(["Epic A", "Epic B"]);
    expect(groups[0].records).toHaveLength(2);
  });

  it("groups checkboxes into unchecked and checked", () => {
    const check = field({
      type: DatabaseFieldType.Checkbox,
      cellValueType: "boolean",
    });
    const groups = groupRecords(
      [record("1", true), record("2", undefined), record("3", false)],
      check
    );
    expect(groups.map((g) => [g.key, g.records.length])).toEqual([
      ["false", 2],
      ["true", 1],
    ]);
  });

  it("sorts numbers numerically and dates by day", () => {
    const num = field({
      type: DatabaseFieldType.Number,
      cellValueType: "number",
    });
    expect(
      groupRecords([record("1", 10), record("2", 9)], num).map((g) => g.key)
    ).toEqual(["9", "10"]);
    const date = field({
      type: DatabaseFieldType.Date,
      cellValueType: "dateTime",
    });
    expect(
      groupValues(date, "2026-09-25T10:00:00.000Z").map((g) => g.key)
    ).toEqual(["2026-09-25"]);
  });
});

describe("groupPrefill", () => {
  it("writes the group value into a new row", () => {
    expect(groupPrefill(status, { key: "Doing", value: "Doing" })).toBe(
      "Doing"
    );
    expect(groupPrefill(status, { key: "", value: undefined })).toBeUndefined();
    const user = field({ type: DatabaseFieldType.User });
    expect(
      groupPrefill(user, {
        key: "usr1",
        value: { id: "usr1", title: "Ada", outlineUserId: "u-1" },
      })
    ).toEqual({ outlineUserId: "u-1" });
    const formula = field({
      type: DatabaseFieldType.Formula,
      isComputed: true,
    });
    expect(groupPrefill(formula, { key: "x", value: "x" })).toBeUndefined();
  });
});

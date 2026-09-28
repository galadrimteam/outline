import { DatabaseFieldType } from "@shared/databases/types";
import { makeField } from "../testFixtures";
import { parseRollup, rollupCell, rollupType } from "./rollup";

const number = makeField({ id: "n", type: DatabaseFieldType.Number });
const date = makeField({ id: "d", type: DatabaseFieldType.Date });
const check = makeField({ id: "c", type: DatabaseFieldType.Checkbox });
const tags = makeField({ id: "t", type: DatabaseFieldType.MultipleSelect });
const price = makeField({
  id: "p",
  type: DatabaseFieldType.Number,
  options: { formatting: { type: "decimal", precision: 2 } },
});

describe("parseRollup", () => {
  it("reads the aggregations rollups have", () => {
    expect(parseRollup("sum({values})")).toBe("sum");
    expect(parseRollup(" ARRAY_JOIN( { values } ) ")).toBe("array_join");
    expect(parseRollup("median({values})")).toBeNull();
    expect(parseRollup(undefined)).toBeNull();
  });
});

describe("rollupType", () => {
  it("types counts as numbers, date extremes as dates, lists as lists", () => {
    const dates = { type: "dateTime" as const, isMultiple: false };
    expect(rollupType("countall", dates)).toEqual({
      type: "number",
      isMultiple: false,
    });
    expect(rollupType("max", dates)).toEqual(dates);
    expect(rollupType("and", dates).type).toBe("boolean");
    expect(rollupType("concatenate", dates).type).toBe("string");
    expect(rollupType("array_unique", dates)).toEqual({
      type: "dateTime",
      isMultiple: true,
    });
  });
});

describe("rollupCell", () => {
  it("sums and averages to 0 without values, ignoring blanks", () => {
    expect(rollupCell("sum", [1, null, 2.5], number)).toBe(3.5);
    expect(rollupCell("sum", [], number)).toBe(0);
    expect(rollupCell("average", [1, null, 2], number)).toBe(1.5);
    expect(rollupCell("average", [], number)).toBe(0);
  });

  it("counts every linked row with countall, rows with a value otherwise", () => {
    expect(rollupCell("countall", [1, null, 3], number)).toBe(3);
    expect(rollupCell("counta", [1, null, 3], number)).toBe(2);
    expect(rollupCell("count", [1, null, ""], number)).toBe(1);
    expect(rollupCell("countall", [["a", "b"], null, ["c"]], tags)).toBe(3);
  });

  it("finds extremes of numbers and dates", () => {
    expect(rollupCell("max", [1, 5, null], number)).toBe(5);
    expect(rollupCell("min", [], number)).toBeNull();
    expect(
      rollupCell(
        "min",
        ["2025-03-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"],
        date
      )
    ).toBe("2025-01-01T00:00:00.000Z");
  });

  it("combines checkboxes, blanks aside", () => {
    expect(rollupCell("and", [true, null, true], check)).toBe(true);
    expect(rollupCell("and", [true, false], check)).toBe(false);
    expect(rollupCell("and", [null], check)).toBeNull();
    expect(rollupCell("or", [null, true], check)).toBe(true);
    expect(rollupCell("xor", [true, true, true], check)).toBe(true);
  });

  it("joins the values as their field shows them, lists without repeats", () => {
    expect(rollupCell("array_join", [1.5, null, 2], price)).toBe("1.50, 2.00");
    expect(rollupCell("concatenate", [["a", "b"], ["c"]], tags)).toBe(
      "a, b, c"
    );
    expect(rollupCell("array_join", [], price)).toBeNull();
    expect(rollupCell("array_unique", [["a", "b"], ["a"], null], tags)).toEqual(
      ["a", "b"]
    );
    expect(rollupCell("array_compact", [["a", ""], null, ["a"]], tags)).toEqual(
      ["a", "a"]
    );
    expect(
      rollupCell(
        "array_unique",
        [[{ id: "u1", title: "Ada" }], [{ id: "u1", title: "Ada" }]],
        makeField({ id: "u", type: DatabaseFieldType.User })
      )
    ).toEqual([{ id: "u1", title: "Ada" }]);
  });
});

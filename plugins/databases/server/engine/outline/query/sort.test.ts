import type { DatabaseCellValue } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { ComputedRecord } from "./contract";
import type { QueryField } from "./fields";
import { compareSortValues, sortRecords, sortValue } from "./sort";
import { PARIS, makeField, makeRecord } from "./testFixtures";

const records = (
  field: QueryField,
  values: DatabaseCellValue[]
): ComputedRecord[] =>
  values.map((value, index) => ({
    row: makeRecord(`rec${index}`, {}, { autoNumber: index + 1 }),
    cells: { [field.id]: value },
  }));

const order = (
  field: QueryField,
  values: DatabaseCellValue[],
  direction: "asc" | "desc" = "asc"
) =>
  sortRecords(records(field, values), [{ field, order: direction }]).map(
    (record) => record.cells[field.id]
  );

describe("sortRecords", () => {
  it("orders numbers numerically, empties first ascending and last descending", () => {
    const field = makeField({ id: "n", type: DatabaseFieldType.Number });
    expect(order(field, [10, null, 2, 33])).toEqual([null, 2, 10, 33]);
    expect(order(field, [10, null, 2, 33], "desc")).toEqual([33, 10, 2, null]);
  });

  it("orders text in French: case, accents and numbers read naturally", () => {
    const field = makeField({
      id: "t",
      type: DatabaseFieldType.SingleLineText,
    });
    expect(order(field, ["b", "Étude", "a10", "a2", "", "zèbre"])).toEqual([
      "",
      "a2",
      "a10",
      "b",
      "Étude",
      "zèbre",
    ]);
  });

  it("orders selects by the order of their choices", () => {
    const field = makeField({
      id: "s",
      type: DatabaseFieldType.SingleSelect,
      options: {
        choices: ["Todo", "Doing", "Done"].map((name) => ({
          name,
          color: "gray",
        })),
      },
    });
    expect(order(field, ["Done", "Todo", null, "Doing"])).toEqual([
      null,
      "Todo",
      "Doing",
      "Done",
    ]);
    const multi = makeField({
      id: "m",
      type: DatabaseFieldType.MultipleSelect,
      options: { choices: ["x", "y"].map((name) => ({ name, color: "gray" })) },
    });
    expect(order(multi, [["y"], ["x", "y"], ["x"]])).toEqual([
      ["x"],
      ["x", "y"],
      ["y"],
    ]);
  });

  it("orders dates by day, by instant when the field shows a time", () => {
    const byDay = makeField({
      id: "d",
      type: DatabaseFieldType.Date,
      options: {
        formatting: { date: "YYYY-MM-DD", time: "None", timeZone: PARIS },
      },
    });
    const late = "2025-06-01T20:00:00.000Z";
    const early = "2025-06-01T08:00:00.000Z";
    expect(order(byDay, [late, early])).toEqual([late, early]);
    const byTime = makeField({
      id: "t",
      type: DatabaseFieldType.Date,
      options: {
        formatting: { date: "YYYY-MM-DD", time: "HH:mm", timeZone: PARIS },
      },
    });
    expect(order(byTime, [late, early])).toEqual([early, late]);
  });

  it("orders people and links by title, checkboxes unchecked first", () => {
    const people = makeField({ id: "p", type: DatabaseFieldType.User });
    expect(
      order(people, [
        { id: "2", title: "Zoé" },
        { id: "1", title: "Ada" },
      ])
    ).toEqual([
      { id: "1", title: "Ada" },
      { id: "2", title: "Zoé" },
    ]);
    const check = makeField({ id: "c", type: DatabaseFieldType.Checkbox });
    expect(order(check, [true, null, true, null])).toEqual([
      null,
      null,
      true,
      true,
    ]);
  });

  it("breaks ties with the view's manual order, then creation", () => {
    const field = makeField({ id: "n", type: DatabaseFieldType.Number });
    const rows: ComputedRecord[] = [
      {
        row: makeRecord("a", {}, { autoNumber: 1, orders: { viw1: 3 } }),
        cells: { n: 1 },
      },
      {
        row: makeRecord("b", {}, { autoNumber: 2, orders: { viw1: 1 } }),
        cells: { n: 1 },
      },
      { row: makeRecord("c", {}, { autoNumber: 3 }), cells: { n: 1 } },
    ];
    expect(
      sortRecords(rows, [{ field, order: "asc" }], "viw1").map(
        (record) => record.row.id
      )
    ).toEqual(["b", "a", "c"]);
    expect(
      sortRecords(rows, [], undefined).map((record) => record.row.id)
    ).toEqual(["a", "b", "c"]);
  });
});

describe("sortValue and compareSortValues", () => {
  it("compares lists element by element", () => {
    const field = makeField({
      id: "n",
      type: DatabaseFieldType.Number,
      isLookup: true,
      isMultipleCellValue: true,
    });
    const a = sortValue(field, [1, 5]);
    const b = sortValue(field, [1, 2]);
    expect(compareSortValues(a, b, "asc")).toBeGreaterThan(0);
    expect(compareSortValues(sortValue(field, []), b, "asc")).toBeLessThan(0);
  });
});

import { DatabaseFieldType } from "@shared/databases/types";
import { evaluate, makeField } from "../../testFixtures";

const fields = [
  makeField({ id: "tags", type: DatabaseFieldType.MultipleSelect }),
  makeField({
    id: "numbers",
    type: DatabaseFieldType.Number,
    isLookup: true,
    isMultipleCellValue: true,
  }),
  makeField({ id: "links", type: DatabaseFieldType.Link }),
  makeField({ id: "blank", type: DatabaseFieldType.SingleLineText }),
];
const cells = {
  tags: ["a", "b", "a", ""],
  numbers: [3, 1, 3],
  links: [{ id: "rec1", title: "One" }],
  blank: null,
};
const run = (expression: string) => evaluate(expression, { fields, cells });

describe("list functions", () => {
  it("counts elements, filled ones and numbers", () => {
    expect(run("COUNTALL({tags})").value).toBe(4);
    expect(run("COUNTALL({blank})").value).toBe(0);
    expect(run('COUNTALL("x")').value).toBe(1);
    expect(run("COUNTA({tags})").value).toBe(3);
    expect(run("COUNTA({links}) = 0").value).toBe(false);
    expect(run("COUNTA({blank})").value).toBe(0);
    expect(run("COUNT({numbers}, {tags})").value).toBe(3);
  });

  it("joins, deduplicates, flattens and compacts lists", () => {
    expect(run("ARRAY_JOIN({tags})").value).toBe("a, b, a");
    expect(run('ARRAY_JOIN({numbers}, " | ")').value).toBe("3 | 1 | 3");
    expect(run("ARRAY_UNIQUE({tags})")).toEqual({
      type: { type: "string", isMultiple: true },
      value: ["a", "b", ""],
    });
    expect(run("ARRAY_UNIQUE({numbers})")).toEqual({
      type: { type: "number", isMultiple: true },
      value: [3, 1],
    });
    expect(run("ARRAY_COMPACT({tags})").value).toEqual(["a", "b", "a"]);
    expect(run("ARRAYFLATTEN({tags}, {numbers})")).toEqual({
      type: { type: "string", isMultiple: true },
      value: ["a", "b", "a", "", "3", "1", "3"],
    });
    expect(run("ARRAY_COMPACT({blank})").value).toBeNull();
  });
});

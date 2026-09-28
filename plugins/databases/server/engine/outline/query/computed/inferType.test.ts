import { DatabaseFieldType } from "@shared/databases/types";
import { makeField, makeTable } from "../testFixtures";
import { inferFieldType } from "./inferType";

const projects = makeTable("tblProjects", [
  makeField({ id: "name", type: DatabaseFieldType.SingleLineText }),
  makeField({ id: "budget", type: DatabaseFieldType.Number }),
  makeField({ id: "tags", type: DatabaseFieldType.MultipleSelect }),
]);
const tasks = makeTable("tblTasks", [
  makeField({ id: "title", type: DatabaseFieldType.SingleLineText }),
  makeField({ id: "due", type: DatabaseFieldType.Date }),
  makeField({
    id: "project",
    type: DatabaseFieldType.Link,
    options: { foreignTableId: "tblProjects", relationship: "manyOne" },
  }),
]);
const tables = [projects, tasks];
const lookupOptions = (lookupFieldId: string) => ({
  foreignTableId: "tblProjects",
  linkFieldId: "project",
  lookupFieldId,
});

describe("inferFieldType", () => {
  it("types formulas from their expression", () => {
    const infer = (expression: string) =>
      inferFieldType(
        {
          type: DatabaseFieldType.Formula,
          options: { expression },
          lookupOptions: null,
        },
        tasks,
        tables
      );
    expect(infer("{due}")).toEqual({
      cellValueType: "dateTime",
      isMultipleCellValue: false,
    });
    expect(infer('DATE_ADD({due}, 1, "day")').cellValueType).toBe("dateTime");
    expect(infer("{due} > TODAY()").cellValueType).toBe("boolean");
    expect(infer('{title} & "!"').cellValueType).toBe("string");
    expect(infer("{project}")).toEqual({
      cellValueType: "string",
      isMultipleCellValue: false,
    });
  });

  it("returns the reason a formula cannot be computed", () => {
    const infer = (expression: string) =>
      inferFieldType(
        {
          type: DatabaseFieldType.Formula,
          options: { expression },
          lookupOptions: null,
        },
        tasks,
        tables
      );
    expect(infer("{missing}")).toEqual({
      cellValueType: "string",
      isMultipleCellValue: false,
      error: "Unknown field {missing}",
    });
    expect(infer("FOO(1)").error).toBe("Unknown function FOO");
    expect(infer("1 +").error).toMatch(/Unexpected end of formula/);
    expect(infer("").error).toMatch(/empty/);
  });

  it("types rollups and lookups from the looked-up field", () => {
    const rollup = (expression: string, lookupFieldId: string) =>
      inferFieldType(
        {
          type: DatabaseFieldType.Rollup,
          options: { expression },
          lookupOptions: lookupOptions(lookupFieldId),
        },
        tasks,
        tables
      );
    expect(rollup("sum({values})", "budget")).toEqual({
      cellValueType: "number",
      isMultipleCellValue: false,
    });
    expect(rollup("array_unique({values})", "tags")).toEqual({
      cellValueType: "string",
      isMultipleCellValue: true,
    });
    expect(rollup("median({values})", "budget").error).toMatch(
      /Unknown rollup/
    );
    expect(rollup("sum({values})", "gone").error).toMatch(/no longer exists/);

    const lookup = (lookupFieldId: string) =>
      inferFieldType(
        {
          type: DatabaseFieldType.Number,
          options: {},
          lookupOptions: lookupOptions(lookupFieldId),
        },
        tasks,
        tables
      );
    expect(lookup("budget")).toEqual({
      cellValueType: "number",
      isMultipleCellValue: false,
    });
    expect(lookup("tags")).toEqual({
      cellValueType: "string",
      isMultipleCellValue: true,
    });
  });

  it("types fields that are not computed by their type", () => {
    const infer = (type: DatabaseFieldType, options = {}) =>
      inferFieldType({ type, options, lookupOptions: null }, tasks, tables);
    expect(infer(DatabaseFieldType.Checkbox).cellValueType).toBe("boolean");
    expect(infer(DatabaseFieldType.CreatedTime).cellValueType).toBe("dateTime");
    expect(
      infer(DatabaseFieldType.User, { isMultiple: true }).isMultipleCellValue
    ).toBe(true);
    expect(infer(DatabaseFieldType.Link).isMultipleCellValue).toBe(true);
    expect(
      infer(DatabaseFieldType.Link, { relationship: "manyOne" })
        .isMultipleCellValue
    ).toBe(false);
    expect(infer(DatabaseFieldType.ConditionalRollup).error).toMatch(
      /not supported/
    );
  });
});

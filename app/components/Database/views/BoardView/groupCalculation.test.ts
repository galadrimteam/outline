import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { columnCalculation, columnValue } from "./groupCalculation";

const estimate: DatabaseField = {
  id: "fldEstimate",
  name: "Estimation",
  type: DatabaseFieldType.Number,
  options: {},
  isPrimary: false,
  isComputed: false,
  isLookup: false,
  cellValueType: "number",
  isMultipleCellValue: false,
};

const database = {
  fieldById: (id: string) => (id === estimate.id ? estimate : undefined),
};

describe("columnCalculation", () => {
  it("counts the cards by default", () => {
    expect(columnCalculation(database, { overrides: {} })).toEqual({
      kind: "count",
    });
  });

  it("calculates over the property the view names", () => {
    expect(
      columnCalculation(database, {
        overrides: {
          groupCalculation: { func: "sum", fieldId: "fldEstimate" },
        },
      })
    ).toEqual({ kind: "field", func: "sum", field: estimate });
  });

  it("shows nothing when the view hides the calculation", () => {
    expect(
      columnCalculation(database, {
        overrides: { groupCalculation: { func: "none" } },
      })
    ).toEqual({ kind: "none" });
  });

  it("counts the cards again once the property is deleted", () => {
    expect(
      columnCalculation(database, {
        overrides: { groupCalculation: { func: "sum", fieldId: "fldGone" } },
      })
    ).toEqual({ kind: "count" });
  });
});

describe("columnValue", () => {
  it("sums to 0 a column with nothing to add, as Notion does", () => {
    expect(columnValue("sum", null)).toBe(0);
    expect(columnValue("sum", 176)).toBe(176);
  });

  it("leaves the other calculations as the server answers them", () => {
    expect(columnValue("average", null)).toBeNull();
    expect(columnValue("filled", 3)).toBe(3);
  });
});

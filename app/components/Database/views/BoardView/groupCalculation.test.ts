import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { columnCalculation } from "./groupCalculation";

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

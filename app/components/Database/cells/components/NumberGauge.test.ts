import { DatabaseFieldType } from "@shared/databases/types";
import type { DatabaseField } from "@shared/databases/types";
import { gaugeShare, numberShowAs } from "./NumberGauge";

const field = (showAs?: DatabaseField["options"]["showAs"]): DatabaseField => ({
  id: "f",
  name: "Formule",
  type: DatabaseFieldType.Formula,
  options: showAs ? { showAs } : {},
  isPrimary: false,
  isComputed: true,
  isLookup: false,
  cellValueType: "number",
  isMultipleCellValue: false,
});

describe("numberShowAs", () => {
  it("reads the ring or the bar a number is shown as", () => {
    expect(numberShowAs(field())).toBeUndefined();
    expect(numberShowAs(field({ type: "text" }))).toBeUndefined();
    expect(
      numberShowAs(field({ type: "ring", color: "green", maxValue: 10 }))
    ).toEqual({ type: "ring", color: "green", maxValue: 10, showValue: true });
    expect(
      numberShowAs(field({ type: "bar", maxValue: 0, showValue: false }))
    ).toEqual({
      type: "bar",
      color: undefined,
      maxValue: undefined,
      showValue: false,
    });
  });
});

describe("gaugeShare", () => {
  it("fills up to the value, a percentage for percent fields", () => {
    expect(gaugeShare(5, { maxValue: 10 }, false)).toBe(0.5);
    expect(gaugeShare(0.25, {}, true)).toBe(0.25);
    expect(gaugeShare(250, {}, false)).toBe(1);
    expect(gaugeShare(-3, {}, false)).toBe(0);
  });
});

import { DatabaseFieldType } from "@shared/databases/types";
import { evaluate, makeField } from "../../testFixtures";
import { roundNumber } from "./numeric";

const fields = [
  makeField({
    id: "values",
    type: DatabaseFieldType.Number,
    isLookup: true,
    isMultipleCellValue: true,
  }),
  makeField({ id: "blank", type: DatabaseFieldType.Number }),
  makeField({ id: "text", type: DatabaseFieldType.SingleLineText }),
  makeField({
    id: "dates",
    type: DatabaseFieldType.Date,
    isMultipleCellValue: true,
  }),
];
const cells = {
  values: [1, 2, 3.5],
  blank: null,
  text: "12,5 €",
  dates: ["2025-03-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"],
};
const run = (expression: string) =>
  evaluate(expression, { fields, cells }).value;

describe("numeric functions", () => {
  it("sums, averages and finds extremes of lists and arguments", () => {
    expect(run("SUM({values}, 10, {blank})")).toBe(16.5);
    expect(run("SUM({blank})")).toBe(0);
    expect(run("AVERAGE({values})")).toBeCloseTo(2.1667, 3);
    expect(run("AVERAGE({blank})")).toBeNull();
    expect(run("MAX({values}, 3)")).toBe(3.5);
    expect(run("MIN(4, {values})")).toBe(1);
    expect(run("MAX({dates})")).toBe(Date.parse("2025-03-01T00:00:00.000Z"));
    expect(evaluate("MIN({dates})", { fields, cells }).type.type).toBe(
      "dateTime"
    );
  });

  it("rounds like PostgreSQL: halves away from zero, without binary noise", () => {
    expect(run("ROUND(2.5)")).toBe(3);
    expect(run("ROUND(-2.5)")).toBe(-3);
    expect(run("ROUND(1.005, 2)")).toBe(1.01);
    expect(run("ROUND(1234.5, -2)")).toBe(1200);
    expect(run("ROUND({blank}, 2)")).toBeNull();
    expect(run("ROUNDUP(1.21, 1)")).toBe(1.3);
    expect(run("ROUNDUP(-1.21, 1)")).toBe(-1.3);
    expect(run("ROUNDDOWN(-1.29, 1)")).toBe(-1.2);
    expect(run("CEILING(1.2)")).toBe(2);
    expect(run("CEILING(-1.2)")).toBe(-1);
    expect(run("FLOOR(-1.2)")).toBe(-2);
    expect(run("FLOOR(1.26, 1)")).toBe(1.2);
    expect(run("INT(-3.5)")).toBe(-4);
    expect(roundNumber(0.285, 2, "half")).toBe(0.29);
  });

  it("computes the other functions and gives nothing when undefined", () => {
    expect(run("EVEN(1.5)")).toBe(2);
    expect(run("EVEN(-3)")).toBe(-4);
    expect(run("ODD(2)")).toBe(3);
    expect(run("ABS(-2)")).toBe(2);
    expect(run("SQRT(16)")).toBe(4);
    expect(run("SQRT(-1)")).toBeNull();
    expect(run("POWER(2, 10)")).toBe(1024);
    expect(run("EXP(0)")).toBe(1);
    expect(run("LOG(100)")).toBe(2);
    expect(run("LOG(8, 2)")).toBeCloseTo(3, 10);
    expect(run("LOG(0)")).toBeNull();
    expect(run("MOD(7, 3)")).toBe(1);
    expect(run("MOD(-7, 3)")).toBe(-1);
    expect(run("MOD(7, 0)")).toBeNull();
  });

  it("reads numbers out of text", () => {
    expect(run("VALUE({text})")).toBe(125);
    expect(run('VALUE("-3.5 %")')).toBe(-3.5);
    expect(run('VALUE("abc")')).toBeNull();
    expect(run('VALUE("12 €") * 2')).toBe(24);
  });
});

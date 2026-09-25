import type { TFunction } from "i18next";
import { DatabaseFieldType } from "@shared/databases/types";
import {
  formatStatistic,
  statisticFuncsFor,
  statisticLabel,
  statisticShortLabel,
} from "./statistics";
import { makeField } from "./testFixtures";

const t = ((key: string, options?: Record<string, string | number>) =>
  key.replace(/\{\{ (\w+) \}\}/g, (_, name: string) =>
    String(options?.[name] ?? "")
  )) as unknown as TFunction;

describe("statisticFuncsFor", () => {
  it("offers sums for numbers and dates ranges for dates", () => {
    const number = makeField({
      type: DatabaseFieldType.Number,
      cellValueType: "number",
    });
    expect(statisticFuncsFor(number)[0]).toBe("sum");
    const date = makeField({
      type: DatabaseFieldType.Date,
      cellValueType: "dateTime",
    });
    expect(statisticFuncsFor(date)).toContain("earliestDate");
  });

  it("offers checked counts for checkboxes", () => {
    const checkbox = makeField({
      type: DatabaseFieldType.Checkbox,
      cellValueType: "boolean",
    });
    expect(statisticFuncsFor(checkbox)).toEqual([
      "count",
      "checked",
      "unChecked",
      "percentChecked",
      "percentUnChecked",
    ]);
  });

  it("has no unique count for files and multiple people", () => {
    const files = makeField({ type: DatabaseFieldType.Attachment });
    expect(statisticFuncsFor(files)).not.toContain("unique");
    expect(statisticFuncsFor(files)).toContain("totalAttachmentSize");
    const people = makeField({
      type: DatabaseFieldType.User,
      isMultipleCellValue: true,
    });
    expect(statisticFuncsFor(people)).not.toContain("unique");
  });
});

describe("labels", () => {
  it("names every calculation", () => {
    expect(statisticLabel("filled", t)).toBe("Count not empty");
    expect(statisticShortLabel("percentFilled", t)).toBe("Not empty");
    expect(statisticShortLabel("sum", t)).toBe("Sum");
  });
});

describe("formatStatistic", () => {
  const amount = makeField({
    type: DatabaseFieldType.Number,
    cellValueType: "number",
    options: { formatting: { type: "currency", precision: 2, symbol: "$" } },
  });

  it("formats counts, percentages and sums", () => {
    expect(formatStatistic("count", 1234, amount, t, "en-US")).toBe("1,234");
    expect(formatStatistic("percentEmpty", 33.333, amount, t, "en-US")).toBe(
      "33%"
    );
    expect(formatStatistic("sum", 12.5, amount, t, "en-US")).toBe("$12.50");
  });

  it("formats date results and ranges", () => {
    const date = makeField({
      type: DatabaseFieldType.Date,
      cellValueType: "dateTime",
      options: { formatting: { date: "YYYY-MM-DD", timeZone: "UTC" } },
    });
    expect(
      formatStatistic("earliestDate", "2026-01-02T00:00:00.000Z", date, t)
    ).toBe("2026-01-02");
    expect(formatStatistic("dateRangeOfDays", 4.2, date, t)).toBe("4 days");
  });

  it("shows nothing without a result", () => {
    expect(formatStatistic("sum", null, amount, t)).toBe("");
  });
});

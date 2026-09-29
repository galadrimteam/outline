import type {
  DatabaseDateFilterMode,
  DatabaseDateFilterValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { PARIS, makeField } from "../testFixtures";
import { dateFilterRange } from "./dateRange";

// Wednesday 18 June 2025, 10:30 in Paris.
const NOW = Date.parse("2025-06-18T08:30:00.000Z");
const dayField = makeField({
  id: "day",
  type: DatabaseFieldType.Date,
  options: {
    formatting: { date: "D MMMM YYYY", time: "None", timeZone: PARIS },
  },
});
const timeField = makeField({
  id: "time",
  type: DatabaseFieldType.Date,
  options: {
    formatting: { date: "YYYY-MM-DD", time: "HH:mm", timeZone: PARIS },
  },
});
const monthField = makeField({
  id: "month",
  type: DatabaseFieldType.Date,
  options: { formatting: { date: "YYYY-MM", time: "None", timeZone: PARIS } },
});

const range = (
  mode: DatabaseDateFilterMode,
  extra: Partial<DatabaseDateFilterValue> = {},
  field = dayField
) => {
  const result = dateFilterRange(
    { mode, timeZone: PARIS, ...extra },
    field,
    NOW,
    "UTC"
  );
  return result?.map((ms) => new Date(ms).toISOString()) ?? null;
};

/** The instants of Paris days, from the first midnight to the last millisecond. */
const days = (first: string, last: string) => [
  new Date(`${first}T00:00:00+02:00`).toISOString(),
  new Date(
    new Date(`${last}T00:00:00+02:00`).getTime() + 86_400_000 - 1
  ).toISOString(),
];

describe("dateFilterRange", () => {
  it("reads single days", () => {
    expect(range("today")).toEqual(days("2025-06-18", "2025-06-18"));
    expect(range("tomorrow")).toEqual(days("2025-06-19", "2025-06-19"));
    expect(range("yesterday")).toEqual(days("2025-06-17", "2025-06-17"));
    expect(range("oneWeekAgo")).toEqual(days("2025-06-11", "2025-06-11"));
    expect(range("oneWeekFromNow")).toEqual(days("2025-06-25", "2025-06-25"));
    expect(range("oneMonthAgo")).toEqual(days("2025-05-18", "2025-05-18"));
    expect(range("oneMonthFromNow")).toEqual(days("2025-07-18", "2025-07-18"));
    expect(range("daysAgo", { numberOfDays: 3 })).toEqual(
      days("2025-06-15", "2025-06-15")
    );
    expect(range("daysFromNow", { numberOfDays: 3 })).toEqual(
      days("2025-06-21", "2025-06-21")
    );
    expect(range("daysAgo")).toBeNull();
  });

  it("reads calendar periods, weeks from Monday", () => {
    expect(range("currentWeek")).toEqual(days("2025-06-16", "2025-06-22"));
    expect(range("lastWeek")).toEqual(days("2025-06-09", "2025-06-15"));
    expect(range("nextWeekPeriod")).toEqual(days("2025-06-23", "2025-06-29"));
    expect(range("currentMonth")).toEqual(days("2025-06-01", "2025-06-30"));
    expect(range("lastMonth")).toEqual(days("2025-05-01", "2025-05-31"));
    expect(range("nextMonthPeriod")).toEqual(days("2025-07-01", "2025-07-31"));
    expect(range("currentYear")?.[0]).toBe("2024-12-31T23:00:00.000Z");
    expect(range("lastYear")?.[1]).toBe("2024-12-31T22:59:59.999Z");
    expect(range("nextYearPeriod")?.[0]).toBe("2025-12-31T23:00:00.000Z");
  });

  it("reads windows ending or starting today", () => {
    expect(range("pastWeek")).toEqual(days("2025-06-11", "2025-06-18"));
    expect(range("pastMonth")).toEqual(days("2025-05-18", "2025-06-18"));
    expect(range("pastYear")).toEqual(days("2024-06-18", "2025-06-18"));
    expect(range("nextWeek")).toEqual(days("2025-06-18", "2025-06-25"));
    expect(range("nextMonth")).toEqual(days("2025-06-18", "2025-07-18"));
    expect(range("nextYear")).toEqual(days("2025-06-18", "2026-06-18"));
    expect(range("pastNumberOfDays", { numberOfDays: 2 })).toEqual(
      days("2025-06-16", "2025-06-18")
    );
    expect(range("nextNumberOfDays", { numberOfDays: 0 })).toEqual(
      days("2025-06-18", "2025-06-18")
    );
  });

  it("reads exact dates by day, or as an instant on a field with a time", () => {
    const exactDate = "2025-03-10T15:00:00.000Z";
    expect(range("exactDate", { exactDate })).toEqual([
      "2025-03-09T23:00:00.000Z",
      "2025-03-10T22:59:59.999Z",
    ]);
    expect(range("exactDate", { exactDate }, timeField)).toEqual([
      exactDate,
      exactDate,
    ]);
    expect(range("exactFormatDate", { exactDate }, monthField)).toEqual([
      "2025-02-28T23:00:00.000Z",
      "2025-03-31T21:59:59.999Z",
    ]);
    expect(range("exactDate")).toBeNull();
  });

  it("reads date ranges, refusing an end before the start", () => {
    expect(
      range("dateRange", {
        exactDate: "2025-06-01T10:00:00.000Z",
        exactDateEnd: "2025-06-03T10:00:00.000Z",
      })
    ).toEqual(days("2025-06-01", "2025-06-03"));
    expect(
      range("dateRange", {
        exactDate: "2025-06-03T10:00:00.000Z",
        exactDateEnd: "2025-06-01T10:00:00.000Z",
      })
    ).toBeNull();
  });
});

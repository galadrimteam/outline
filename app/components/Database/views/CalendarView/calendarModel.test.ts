import type { DatabaseField, DatabaseRecord } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import {
  dayKey,
  layoutWeek,
  rangeFilter,
  recordSpan,
  shiftDate,
  visibleDays,
  weeksOf,
} from "./calendarModel";

function dateField(id: string, timeZone = "Europe/Paris"): DatabaseField {
  return {
    id,
    name: id,
    type: DatabaseFieldType.Date,
    options: { formatting: { timeZone } },
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "dateTime",
    isMultipleCellValue: false,
  };
}

const start = dateField("start");
const end = dateField("end");

function record(id: string, from?: string, to?: string): DatabaseRecord {
  const fields: DatabaseRecord["fields"] = {};
  if (from) {
    fields.start = from;
  }
  if (to) {
    fields.end = to;
  }
  return { id, fields };
}

describe("visibleDays", () => {
  it("covers the month with whole weeks starting on Monday", () => {
    const days = visibleDays(new Date(2026, 8, 25), "month");
    expect(dayKey(days[0])).toBe("2026-08-31");
    expect(dayKey(days[days.length - 1])).toBe("2026-10-04");
    expect(days.length % 7).toBe(0);
    expect(weeksOf(days)).toHaveLength(5);
  });

  it("shows the week of the day", () => {
    const days = visibleDays(new Date(2026, 8, 27), "week");
    expect(days.map(dayKey)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });
});

describe("recordSpan", () => {
  it("reads days in the field time zone", () => {
    const span = recordSpan(record("1", "2026-09-24T22:00:00.000Z"), start);
    expect(span && dayKey(span.start)).toBe("2026-09-25");
    expect(span && dayKey(span.end)).toBe("2026-09-25");
  });

  it("uses the end field, ignoring an end before the start", () => {
    const range = recordSpan(
      record("1", "2026-09-24T22:00:00.000Z", "2026-09-27T22:00:00.000Z"),
      start,
      end
    );
    expect(range && dayKey(range.end)).toBe("2026-09-28");
    const backwards = recordSpan(
      record("1", "2026-09-24T22:00:00.000Z", "2026-09-20T22:00:00.000Z"),
      start,
      end
    );
    expect(backwards && dayKey(backwards.end)).toBe("2026-09-25");
    expect(recordSpan(record("2"), start)).toBeUndefined();
  });
});

describe("layoutWeek", () => {
  const week = visibleDays(new Date(2026, 8, 23), "week");
  const item = (id: string, from: number, to: number) => ({
    record: record(id),
    start: new Date(2026, 8, from),
    end: new Date(2026, 8, to),
  });

  it("stacks overlapping items on separate lines", () => {
    const { segments, lanes } = layoutWeek(week, [
      item("a", 22, 24),
      item("b", 23, 23),
      item("c", 25, 26),
      item("d", 10, 12),
    ]);
    expect(lanes).toBe(2);
    expect(
      segments.map((s) => [s.item.record.id, s.column, s.span, s.lane])
    ).toEqual([
      ["a", 1, 3, 0],
      ["b", 2, 1, 1],
      ["c", 4, 2, 0],
    ]);
  });

  it("clips items crossing the week", () => {
    const { segments } = layoutWeek(week, [item("a", 18, 30)]);
    expect(segments[0]).toMatchObject({
      column: 0,
      span: 7,
      continuesBefore: true,
      continuesAfter: true,
    });
  });
});

describe("shiftDate", () => {
  it("keeps the time of day across a daylight saving change", () => {
    expect(shiftDate("2026-10-24T07:30:00.000Z", 2, "Europe/Paris")).toBe(
      "2026-10-26T08:30:00.000Z"
    );
    expect(shiftDate("2026-09-24T22:00:00.000Z", -1, "Europe/Paris")).toBe(
      "2026-09-23T22:00:00.000Z"
    );
  });
});

describe("rangeFilter", () => {
  it("keeps rows overlapping the shown days", () => {
    const filter = rangeFilter(
      start,
      end,
      new Date(2026, 8, 1),
      new Date(2026, 8, 30)
    );
    expect(filter.conjunction).toBe("and");
    expect(filter.filterSet[0]).toMatchObject({
      fieldId: "start",
      operator: "isOnOrBefore",
      value: { mode: "exactDate", exactDate: "2026-09-29T22:00:00.000Z" },
    });
    expect(filter.filterSet[1]).toMatchObject({ conjunction: "or" });
    expect(
      rangeFilter(start, undefined, new Date(), new Date()).filterSet
    ).toHaveLength(2);
  });
});

import { fr } from "date-fns/locale/fr";
import type { DatabaseField, DatabaseRecord } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { dayKey } from "../CalendarView/calendarModel";
import {
  ALL_VISIBLE,
  barGeometry,
  dayToX,
  dependencyPath,
  dragSpan,
  hiddenBarEnds,
  PX_PER_DAY,
  showsTimelineTable,
  spanFields,
  timelineRange,
  timelineScale,
  visibleSpan,
  xToDay,
} from "./timelineModel";

function dateField(id: string): DatabaseField {
  return {
    id,
    name: id,
    type: DatabaseFieldType.Date,
    options: { formatting: { timeZone: "Europe/Paris" } },
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "dateTime",
    isMultipleCellValue: false,
  };
}

const start = dateField("start");
const end = dateField("end");
const day = (d: number, m = 8) => new Date(2026, m, d);

describe("timelineRange", () => {
  it("covers bars and today with padding, from a Monday", () => {
    const range = timelineRange(
      [{ start: day(1), end: day(10) }],
      day(25),
      "week"
    );
    const last = new Date(range.start);
    last.setDate(last.getDate() + range.days - 1);
    expect(range.start.getDay()).toBe(1);
    expect(dayKey(range.start) <= "2026-08-18").toBe(true);
    expect(dayKey(last)).toBe("2026-10-09");
  });

  it("reaches the days the reader moved to", () => {
    const range = timelineRange([], day(25), "month", [day(25, 11)]);
    const last = new Date(range.start);
    last.setDate(last.getDate() + range.days - 1);
    expect(dayKey(last) >= "2026-12-25").toBe(true);
  });

  it("folds the table unless the view shows it", () => {
    expect(showsTimelineTable(undefined)).toBe(false);
    expect(showsTimelineTable({ showTable: false })).toBe(false);
    expect(showsTimelineTable({ showTable: true })).toBe(true);
  });

  it("starts years on January 1st", () => {
    const range = timelineRange([], day(25), "year");
    expect(dayKey(range.start)).toBe("2026-01-01");
  });
});

describe("geometry", () => {
  it("converts days and pixels both ways", () => {
    const origin = day(21);
    expect(dayToX(day(23), origin, 10)).toBe(20);
    expect(dayKey(xToDay(29, origin, 10))).toBe("2026-09-23");
    expect(barGeometry({ start: day(22), end: day(24) }, origin, 10)).toEqual({
      left: 10,
      width: 30,
    });
  });

  it("moves and resizes without crossing ends", () => {
    const span = { start: day(10), end: day(12) };
    expect(dragSpan(span, "move", 3).start).toEqual(day(13));
    expect(dragSpan(span, "move", 3).end).toEqual(day(15));
    expect(dragSpan(span, "start", 5)).toEqual({
      start: day(12),
      end: day(12),
    });
    expect(dragSpan(span, "end", -1)).toEqual({ start: day(10), end: day(11) });
  });
});

describe("spanFields", () => {
  const record: DatabaseRecord = {
    id: "r",
    fields: {
      start: "2026-09-09T22:00:00.000Z",
      end: "2026-09-11T22:00:00.000Z",
    },
  };
  const before = { start: day(10), end: day(12) };

  it("shifts both dates when a bar moves", () => {
    expect(
      spanFields(record, before, dragSpan(before, "move", 2), start, end)
    ).toEqual({
      start: "2026-09-11T22:00:00.000Z",
      end: "2026-09-13T22:00:00.000Z",
    });
  });

  it("writes only the dragged end", () => {
    expect(
      spanFields(record, before, dragSpan(before, "end", 1), start, end)
    ).toEqual({ end: "2026-09-12T22:00:00.000Z" });
    expect(spanFields(record, before, before, start, end)).toEqual({});
  });

  it("dates an undated row", () => {
    expect(
      spanFields(
        { id: "x", fields: {} },
        undefined,
        { start: day(10), end: day(10) },
        start,
        end
      )
    ).toEqual({
      start: "2026-09-09T22:00:00.000Z",
      end: "2026-09-09T22:00:00.000Z",
    });
  });
});

describe("timelineScale", () => {
  it("puts months over days in the month zoom", () => {
    const scale = timelineScale(day(28), 7, "month", fr);
    expect(scale.top.map((u) => u.label)).toEqual([
      "septembre 2026",
      "octobre",
    ]);
    expect(scale.top[0]).toMatchObject({
      left: 0,
      width: 3 * PX_PER_DAY.month,
    });
    expect(scale.bottom.map((u) => u.label)).toEqual([
      "28",
      "29",
      "30",
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("names months in full in the quarter zoom, the year on January", () => {
    const scale = timelineScale(day(1, 10), 70, "quarter", fr);
    expect(scale.top.map((u) => u.label)).toEqual([
      "novembre 2026",
      "décembre",
      "janvier 2027",
    ]);
  });

  it("puts years over months in the year zoom", () => {
    const scale = timelineScale(new Date(2026, 0, 1), 365, "year", fr);
    expect(scale.top).toHaveLength(1);
    expect(scale.bottom).toHaveLength(12);
  });
});

describe("dependencyPath", () => {
  it("draws a right-angled path", () => {
    expect(dependencyPath({ x: 0, y: 10 }, { x: 100, y: 50 })).toBe(
      "M 0 10 H 8 V 50 H 100"
    );
    expect(dependencyPath({ x: 100, y: 10 }, { x: 50, y: 50 })).toContain(
      "V 30"
    );
  });
});

describe("visibleSpan", () => {
  it("keeps the whole days in sight", () => {
    expect(visibleSpan(5107, 1070, 28)).toEqual({ left: 5124, right: 6160 });
    expect(visibleSpan(5124, 1036, 28)).toEqual({ left: 5124, right: 6160 });
  });
});

describe("hiddenBarEnds", () => {
  const visible = { left: 280, right: 1120 };

  it("tells a bar that starts before the part in sight", () => {
    expect(hiddenBarEnds({ left: 0, width: 100 }, visible)).toEqual({
      start: true,
      end: false,
    });
    expect(hiddenBarEnds({ left: 252, width: 2000 }, visible)).toEqual({
      start: true,
      end: true,
    });
  });

  it("tells a bar that goes past the right edge", () => {
    expect(hiddenBarEnds({ left: 1100, width: 56 }, visible)).toEqual({
      start: false,
      end: true,
    });
    expect(hiddenBarEnds({ left: 280, width: 840 }, visible)).toEqual({
      start: false,
      end: false,
    });
  });

  it("hides nothing before the timeline is measured", () => {
    expect(hiddenBarEnds({ left: -500, width: 9000 }, ALL_VISIBLE)).toEqual({
      start: false,
      end: false,
    });
  });
});

import type { Locale } from "date-fns";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  max as maxDate,
  min as minDate,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseRecord,
  DatabaseTimelineZoom,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import { calendarDayToISO, fieldTimeZone } from "../../cells/format";
import type { DaySpan } from "../CalendarView/calendarModel";
import { shiftDate, WEEK_STARTS_ON } from "../CalendarView/calendarModel";

/** Width of one day, per zoom level. */
export const PX_PER_DAY: Record<DatabaseTimelineZoom, number> = {
  week: 64,
  month: 28,
  quarter: 10,
  year: 3,
};

/** How far the previous and next buttons move the timeline, in days, per zoom. */
export const STEP_DAYS: Record<DatabaseTimelineZoom, number> = {
  week: 7,
  month: 30,
  quarter: 91,
  year: 365,
};

/** What a pointer drag on a bar changes. */
export type BarDragMode = "move" | "start" | "end";

/** A labelled slice of the timeline header. */
export interface ScaleUnit {
  key: string;
  label: string;
  left: number;
  width: number;
}

/** The two header lines of the timeline. */
export interface TimelineScale {
  top: ScaleUnit[];
  bottom: ScaleUnit[];
}

/** Horizontal place of a bar, in pixels from the start of the timeline. */
export interface BarGeometry {
  left: number;
  width: number;
}

const PADDING_DAYS: Record<DatabaseTimelineZoom, number> = {
  week: 14,
  month: 45,
  quarter: 120,
  year: 240,
};

const MAX_DAYS = 3650;

/**
 * Whether a timeline shows its table on the left. Notion leaves it folded
 * unless the view says otherwise.
 *
 * @param timeline the timeline settings of the view.
 * @returns true when the table is shown.
 */
export function showsTimelineTable(
  timeline: DatabaseViewOverrides["timeline"]
): boolean {
  return timeline?.showTable === true;
}

/**
 * Returns the days the timeline covers: every bar, today and the days the
 * reader moved to, with room on both sides, starting on a Monday (or a
 * January 1st for years) so that grid lines fall on weeks.
 *
 * @param spans the spans of the rows.
 * @param today the current day.
 * @param zoom the zoom level.
 * @param visited days that must be on the timeline too.
 * @returns the first day and the number of days.
 */
export function timelineRange(
  spans: DaySpan[],
  today: Date,
  zoom: DatabaseTimelineZoom,
  visited: Date[] = []
): { start: Date; days: number } {
  const padding = PADDING_DAYS[zoom];
  const first = addDays(
    minDate([today, ...visited, ...spans.map((s) => s.start)]),
    -padding
  );
  const last = addDays(
    maxDate([today, ...visited, ...spans.map((s) => s.end)]),
    padding
  );
  const start =
    zoom === "year"
      ? startOfYear(first)
      : startOfWeek(first, { weekStartsOn: WEEK_STARTS_ON });
  const days = Math.min(differenceInCalendarDays(last, start) + 1, MAX_DAYS);
  return { start, days };
}

/**
 * Returns the x position of the start of a day.
 *
 * @param day the day.
 * @param rangeStart the first day of the timeline.
 * @param pxPerDay the width of a day.
 * @returns pixels from the start of the timeline.
 */
export function dayToX(day: Date, rangeStart: Date, pxPerDay: number): number {
  return differenceInCalendarDays(day, rangeStart) * pxPerDay;
}

/**
 * Returns the day at an x position.
 *
 * @param x pixels from the start of the timeline.
 * @param rangeStart the first day of the timeline.
 * @param pxPerDay the width of a day.
 * @returns the day.
 */
export function xToDay(x: number, rangeStart: Date, pxPerDay: number): Date {
  return addDays(rangeStart, Math.floor(x / pxPerDay));
}

/**
 * Returns where a bar is drawn: from the start of its first day to the end of
 * its last one.
 *
 * @param span the days of the row.
 * @param rangeStart the first day of the timeline.
 * @param pxPerDay the width of a day.
 * @returns the left edge and the width.
 */
export function barGeometry(
  span: DaySpan,
  rangeStart: Date,
  pxPerDay: number
): BarGeometry {
  return {
    left: dayToX(span.start, rangeStart, pxPerDay),
    width: (differenceInCalendarDays(span.end, span.start) + 1) * pxPerDay,
  };
}

/**
 * Applies a drag to a span: moving shifts both ends, resizing moves one end
 * without crossing the other.
 *
 * @param span the span before the drag.
 * @param mode what the drag changes.
 * @param days the number of days dragged, negative to the left.
 * @returns the new span.
 */
export function dragSpan(
  span: DaySpan,
  mode: BarDragMode,
  days: number
): DaySpan {
  switch (mode) {
    case "move":
      return { start: addDays(span.start, days), end: addDays(span.end, days) };
    case "start": {
      const start = addDays(span.start, days);
      return { start: start > span.end ? span.end : start, end: span.end };
    }
    case "end": {
      const end = addDays(span.end, days);
      return { start: span.start, end: end < span.start ? span.start : end };
    }
  }
}

/**
 * Returns the cells to write for a row to cover a new span, keeping the time
 * of day of dates that have one. Without an end property only the start moves.
 *
 * @param record the row.
 * @param before the span shown before the change.
 * @param after the new span.
 * @param startField the start date field.
 * @param endField the end date field, when the view has one.
 * @returns the cells, empty when nothing changes.
 */
export function spanFields(
  record: DatabaseRecord,
  before: DaySpan | undefined,
  after: DaySpan,
  startField: DatabaseField,
  endField?: DatabaseField
): Record<string, DatabaseCellInput> {
  const fields: Record<string, DatabaseCellInput> = {};
  const startValue = record.fields[startField.id];
  const startZone = fieldTimeZone(startField);

  if (typeof startValue === "string" && before) {
    const moved = differenceInCalendarDays(after.start, before.start);
    if (moved) {
      fields[startField.id] = shiftDate(startValue, moved, startZone);
    }
  } else {
    fields[startField.id] = calendarDayToISO(after.start, undefined, startZone);
  }

  if (!endField) {
    return fields;
  }
  const endValue = record.fields[endField.id];
  const endZone = fieldTimeZone(endField);
  if (typeof endValue === "string" && before) {
    const moved = differenceInCalendarDays(after.end, before.end);
    if (moved) {
      fields[endField.id] = shiftDate(endValue, moved, endZone);
    }
  } else if (differenceInCalendarDays(after.end, after.start) > 0 || !before) {
    fields[endField.id] = calendarDayToISO(after.end, undefined, endZone);
  }
  return fields;
}

/**
 * Builds the two header lines of a zoom level: months over days (week and
 * month zooms), months over weeks (quarter) or years over months (year).
 * Months are named in full, the year only on the first one and on January,
 * as Notion does.
 *
 * @param rangeStart the first day of the timeline.
 * @param days the number of days.
 * @param zoom the zoom level.
 * @param locale the date-fns locale of the reader.
 * @returns the header units.
 */
export function timelineScale(
  rangeStart: Date,
  days: number,
  zoom: DatabaseTimelineZoom,
  locale: Locale
): TimelineScale {
  const px = PX_PER_DAY[zoom];
  const rangeEnd = addDays(rangeStart, days);
  const units = (
    first: Date,
    next: (date: Date) => Date,
    label: (date: Date) => string,
    prefix: string
  ): ScaleUnit[] => {
    const result: ScaleUnit[] = [];
    for (let date = first; date < rangeEnd; date = next(date)) {
      const from = date < rangeStart ? rangeStart : date;
      const to = next(date) > rangeEnd ? rangeEnd : next(date);
      result.push({
        key: `${prefix}${format(date, "yyyy-MM-dd")}`,
        label: label(date),
        left: dayToX(from, rangeStart, px),
        width: differenceInCalendarDays(to, from) * px,
      });
    }
    return result;
  };

  const firstMonth = startOfMonth(rangeStart);
  const months = units(
    firstMonth,
    (date) => addMonths(date, 1),
    (date) =>
      format(
        date,
        date.getTime() === firstMonth.getTime() || date.getMonth() === 0
          ? "LLLL yyyy"
          : "LLLL",
        { locale }
      ),
    "m"
  );

  switch (zoom) {
    case "week":
      return {
        top: months,
        bottom: units(
          rangeStart,
          (date) => addDays(date, 1),
          (date) => format(date, "EEEEE d", { locale }),
          "d"
        ),
      };
    case "month":
      return {
        top: months,
        bottom: units(
          rangeStart,
          (date) => addDays(date, 1),
          (date) => format(date, "d", { locale }),
          "d"
        ),
      };
    case "quarter":
      return {
        top: months,
        bottom: units(
          startOfWeek(rangeStart, { weekStartsOn: WEEK_STARTS_ON }),
          (date) => addWeeks(date, 1),
          (date) => format(date, "d", { locale }),
          "w"
        ),
      };
    case "year":
      return {
        top: units(
          startOfYear(rangeStart),
          (date) => addYears(date, 1),
          (date) => format(date, "yyyy", { locale }),
          "y"
        ),
        bottom: units(
          startOfMonth(rangeStart),
          (date) => addMonths(date, 1),
          (date) => format(date, "MMM", { locale }),
          "m"
        ),
      };
  }
}

/**
 * Draws a dependency arrow from the end of a bar to the start of another,
 * with right angles like Notion's.
 *
 * @param from the right end of the blocking bar.
 * @param to the left end of the blocked bar.
 * @returns the SVG path.
 */
export function dependencyPath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  const gap = 8;
  if (to.x - from.x >= gap * 2) {
    const middle = from.x + gap;
    return `M ${from.x} ${from.y} H ${middle} V ${to.y} H ${to.x}`;
  }
  const between = from.y + (to.y - from.y) / 2;
  return [
    `M ${from.x} ${from.y}`,
    `H ${from.x + gap}`,
    `V ${between}`,
    `H ${to.x - gap}`,
    `V ${to.y}`,
    `H ${to.x}`,
  ].join(" ");
}

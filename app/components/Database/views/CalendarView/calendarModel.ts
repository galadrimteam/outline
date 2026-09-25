import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type {
  DatabaseField,
  DatabaseFilter,
  DatabaseRecord,
} from "@shared/databases/types";
import {
  calendarDayToISO,
  datePartsInZone,
  fieldTimeZone,
  isoToCalendarDay,
} from "../../cells/format";

/** Weeks start on Monday, as in France. */
export const WEEK_STARTS_ON = 1;

/** How much of the calendar is shown. */
export type CalendarMode = "month" | "week";

/** The days a row covers, as local calendar days (midnight). */
export interface DaySpan {
  start: Date;
  end: Date;
}

/** A row placed on the calendar. */
export interface CalendarItem extends DaySpan {
  record: DatabaseRecord;
}

/** The part of an item drawn in one week row. */
export interface WeekSegment {
  item: CalendarItem;
  /** First column, 0 being Monday. */
  column: number;
  /** Number of columns covered. */
  span: number;
  /** Line of the week row the segment is drawn on, 0 being the first. */
  lane: number;
  /** The item started in an earlier week. */
  continuesBefore: boolean;
  /** The item ends in a later week. */
  continuesAfter: boolean;
}

/**
 * Returns the days shown around a date: whole weeks covering its month, or
 * its week.
 *
 * @param anchor a day of the shown period.
 * @param mode month or week.
 * @returns the days, in order, a multiple of seven.
 */
export function visibleDays(anchor: Date, mode: CalendarMode): Date[] {
  const options = { weekStartsOn: WEEK_STARTS_ON } as const;
  const first =
    mode === "month"
      ? startOfWeek(startOfMonth(anchor), options)
      : startOfWeek(anchor, options);
  const last =
    mode === "month"
      ? endOfWeek(endOfMonth(anchor), options)
      : endOfWeek(anchor, options);
  const count = differenceInCalendarDays(last, first) + 1;
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

/**
 * Splits days into weeks.
 *
 * @param days consecutive days starting on a Monday.
 * @returns the weeks, seven days each.
 */
export function weeksOf(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

/**
 * Returns the stable key of a day, used for drop targets.
 *
 * @param day a day.
 * @returns "yyyy-MM-dd".
 */
export function dayKey(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

/**
 * Reads the days a row covers from its start and optional end fields, in the
 * start field's time zone. An end before the start is ignored.
 *
 * @param record the row.
 * @param startField the start date field.
 * @param endField the end date field, when the view has one.
 * @returns the span, or undefined when the row has no start date.
 */
export function recordSpan(
  record: DatabaseRecord,
  startField: DatabaseField,
  endField?: DatabaseField
): DaySpan | undefined {
  const startValue = record.fields[startField.id];
  if (typeof startValue !== "string") {
    return undefined;
  }
  const start = isoToCalendarDay(startValue, fieldTimeZone(startField));
  if (!start) {
    return undefined;
  }
  const endValue = endField ? record.fields[endField.id] : undefined;
  const end =
    endField && typeof endValue === "string"
      ? isoToCalendarDay(endValue, fieldTimeZone(endField))
      : undefined;
  return { start, end: end && end >= start ? end : start };
}

/**
 * Places the items of one week on lines so that none overlap: earlier and
 * longer items first, each on the first free line, like Notion.
 *
 * @param week the seven days of the week.
 * @param items every item; those outside the week are ignored.
 * @returns the segments of the week and the number of lines used.
 */
export function layoutWeek(
  week: Date[],
  items: CalendarItem[]
): { segments: WeekSegment[]; lanes: number } {
  const weekStart = week[0];
  const weekEnd = week[week.length - 1];
  const inWeek = items
    .filter((item) => item.start <= weekEnd && item.end >= weekStart)
    .map((item, order) => {
      const column = Math.max(
        0,
        differenceInCalendarDays(item.start, weekStart)
      );
      const last = Math.min(
        week.length - 1,
        differenceInCalendarDays(item.end, weekStart)
      );
      return { item, column, span: last - column + 1, order };
    })
    .sort(
      (a, b) => a.column - b.column || b.span - a.span || a.order - b.order
    );

  const laneEnds: number[] = [];
  const segments = inWeek.map(({ item, column, span }) => {
    let lane = laneEnds.findIndex((end) => end < column);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = column + span - 1;
    return {
      item,
      column,
      span,
      lane,
      continuesBefore: item.start < weekStart,
      continuesAfter: item.end > weekEnd,
    };
  });

  return { segments, lanes: laneEnds.length };
}

/**
 * Moves a stored date by whole days, keeping its time of day in the field's
 * time zone.
 *
 * @param iso the stored ISO date.
 * @param days the number of days, negative to go back.
 * @param timeZone the field's time zone.
 * @returns the new ISO date.
 */
export function shiftDate(
  iso: string,
  days: number,
  timeZone?: string
): string {
  const parts = datePartsInZone(new Date(iso), timeZone);
  const day = addDays(new Date(parts.year, parts.month - 1, parts.day), days);
  return calendarDayToISO(
    day,
    { hour: parts.hour, minute: parts.minute },
    timeZone
  );
}

/**
 * Returns the filter keeping the rows that overlap a range of days, so a
 * calendar or a timeline only loads what it shows.
 *
 * @param startField the start date field.
 * @param endField the end date field, when the view has one.
 * @param first the first shown day.
 * @param last the last shown day.
 * @returns the filter.
 */
export function rangeFilter(
  startField: DatabaseField,
  endField: DatabaseField | undefined,
  first: Date,
  last: Date
): DatabaseFilter {
  const timeZone =
    fieldTimeZone(startField) ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const exact = (day: Date) => ({
    mode: "exactDate" as const,
    exactDate: calendarDayToISO(day, undefined, timeZone),
    timeZone,
  });
  const startsBeforeEnd = {
    fieldId: startField.id,
    operator: "isOnOrBefore" as const,
    value: exact(last),
  };
  const startsInRange = {
    fieldId: startField.id,
    operator: "isOnOrAfter" as const,
    value: exact(first),
  };

  if (!endField) {
    return { conjunction: "and", filterSet: [startsInRange, startsBeforeEnd] };
  }

  return {
    conjunction: "and",
    filterSet: [
      startsBeforeEnd,
      {
        conjunction: "or",
        filterSet: [
          startsInRange,
          {
            fieldId: endField.id,
            operator: "isOnOrAfter",
            value: exact(first),
          },
        ],
      },
    ],
  };
}

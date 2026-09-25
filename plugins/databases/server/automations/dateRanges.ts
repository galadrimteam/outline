import type { DatabaseDateFilterValue } from "@shared/databases/types";

/** A range of calendar days, "YYYY-MM-DD", both ends included. */
export interface DayRange {
  start: string;
  end: string;
}

/**
 * Returns the calendar day of an instant in a time zone.
 *
 * @param date the instant.
 * @param timeZone an IANA time zone; UTC when unknown.
 * @returns the day, "YYYY-MM-DD".
 */
export function dayIn(date: Date, timeZone: string): string {
  try {
    return formatter(timeZone).format(date);
  } catch (_err) {
    return formatter("UTC").format(date);
  }
}

/**
 * Returns the days a date filter value designates, the way Teable reads its
 * modes. Weeks start on Monday.
 *
 * @param value the filter value.
 * @param now the current instant.
 * @returns the range, or null for a mode that needs a date that is missing.
 */
export function dayRangeOf(
  value: DatabaseDateFilterValue,
  now: Date
): DayRange | null {
  const today = dayIn(now, value.timeZone);
  const days = value.numberOfDays ?? 0;
  const single = (day: string): DayRange => ({ start: day, end: day });

  switch (value.mode) {
    case "today":
      return single(today);
    case "tomorrow":
      return single(addDays(today, 1));
    case "yesterday":
      return single(addDays(today, -1));
    case "oneWeekAgo":
      return single(addDays(today, -7));
    case "oneWeekFromNow":
      return single(addDays(today, 7));
    case "oneMonthAgo":
      return single(addMonths(today, -1));
    case "oneMonthFromNow":
      return single(addMonths(today, 1));
    case "daysAgo":
      return single(addDays(today, -days));
    case "daysFromNow":
      return single(addDays(today, days));
    case "exactDate":
    case "exactFormatDate":
      return value.exactDate
        ? single(dayIn(new Date(value.exactDate), value.timeZone))
        : null;
    case "dateRange":
      return value.exactDate && value.exactDateEnd
        ? {
            start: dayIn(new Date(value.exactDate), value.timeZone),
            end: dayIn(new Date(value.exactDateEnd), value.timeZone),
          }
        : null;
    case "currentWeek":
      return weekOf(today, 0);
    case "lastWeek":
      return weekOf(today, -1);
    case "nextWeekPeriod":
      return weekOf(today, 1);
    case "currentMonth":
      return monthOf(today, 0);
    case "lastMonth":
      return monthOf(today, -1);
    case "nextMonthPeriod":
      return monthOf(today, 1);
    case "currentYear":
      return yearOf(today, 0);
    case "lastYear":
      return yearOf(today, -1);
    case "nextYearPeriod":
      return yearOf(today, 1);
    case "pastWeek":
      return { start: addDays(today, -7), end: today };
    case "pastMonth":
      return { start: addMonths(today, -1), end: today };
    case "pastYear":
      return { start: addMonths(today, -12), end: today };
    case "nextWeek":
      return { start: today, end: addDays(today, 7) };
    case "nextMonth":
      return { start: today, end: addMonths(today, 1) };
    case "nextYear":
      return { start: today, end: addMonths(today, 12) };
    case "pastNumberOfDays":
      return { start: addDays(today, -days), end: today };
    case "nextNumberOfDays":
      return { start: today, end: addDays(today, days) };
    default:
      return null;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let result = formatters.get(timeZone);
  if (!result) {
    result = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, result);
  }
  return result;
}

function toUtc(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, count: number): string {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + count);
  return fromUtc(date);
}

function addMonths(day: string, count: number): string {
  const date = toUtc(day);
  date.setUTCMonth(date.getUTCMonth() + count);
  return fromUtc(date);
}

function weekOf(day: string, offset: number): DayRange {
  const date = toUtc(day);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  const start = addDays(day, offset * 7 - sinceMonday);
  return { start, end: addDays(start, 6) };
}

function monthOf(day: string, offset: number): DayRange {
  const date = toUtc(day);
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0)
  );
  return { start: fromUtc(start), end: fromUtc(end) };
}

function yearOf(day: string, offset: number): DayRange {
  const year = toUtc(day).getUTCFullYear() + offset;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

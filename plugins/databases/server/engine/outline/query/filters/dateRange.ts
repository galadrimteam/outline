import type { DatabaseDateFilterValue } from "@shared/databases/types";
import type { QueryField } from "../fields";
import { fieldTimeZone, formattingOf, showsTime } from "../fields";
import type { TimeUnit } from "../time/calendar";
import { addUnits, endOf, startOf } from "../time/calendar";
import { parseInstant } from "../time/parse";

/** The first and last instants a date filter accepts, both included. */
export type InstantRange = [number, number];

/**
 * Returns the instants a date filter value designates, as Teable reads its
 * modes: days, weeks (from Monday), months and years of the field's zone;
 * "the past week" is from the same day a week ago to the end of today; an
 * exact date on a field showing a time is that very instant.
 *
 * @param value the filter value.
 * @param field the filtered field.
 * @param now the current instant.
 * @param fallbackTimeZone the zone when neither the field nor the value names one.
 * @returns the range, or null when the mode lacks its date or number of days.
 */
export function dateFilterRange(
  value: DatabaseDateFilterValue,
  field: Pick<QueryField, "options">,
  now: number,
  fallbackTimeZone: string
): InstantRange | null {
  const timeZone = fieldTimeZone(field, value.timeZone || fallbackTimeZone);
  const day = (ms: number): InstantRange => [
    startOf(ms, "day", timeZone),
    endOf(ms, "day", timeZone),
  ];
  const period = (unit: TimeUnit, offset: number): InstantRange => {
    const cursor = addUnits(now, offset, unit, timeZone);
    return [startOf(cursor, unit, timeZone), endOf(cursor, unit, timeZone)];
  };
  const past = (unit: TimeUnit, count: number): InstantRange => [
    startOf(
      addUnits(endOf(now, "day", timeZone), -count, unit, timeZone),
      "day",
      timeZone
    ),
    endOf(now, "day", timeZone),
  ];
  const next = (unit: TimeUnit, count: number): InstantRange => [
    startOf(now, "day", timeZone),
    endOf(
      addUnits(startOf(now, "day", timeZone), count, unit, timeZone),
      "day",
      timeZone
    ),
  ];
  const days = validDays(value.numberOfDays);
  const exact = value.exactDate
    ? parseInstant(value.exactDate, timeZone)
    : null;

  switch (value.mode) {
    case "today":
      return day(now);
    case "tomorrow":
      return day(addUnits(now, 1, "day", timeZone));
    case "yesterday":
      return day(addUnits(now, -1, "day", timeZone));
    case "oneWeekAgo":
      return day(addUnits(now, -1, "week", timeZone));
    case "oneWeekFromNow":
      return day(addUnits(now, 1, "week", timeZone));
    case "oneMonthAgo":
      return day(addUnits(now, -1, "month", timeZone));
    case "oneMonthFromNow":
      return day(addUnits(now, 1, "month", timeZone));
    case "daysAgo":
      return days === null ? null : day(addUnits(now, -days, "day", timeZone));
    case "daysFromNow":
      return days === null ? null : day(addUnits(now, days, "day", timeZone));
    case "exactDate":
      if (exact === null) {
        return null;
      }
      return showsTime(field) ? [exact, exact] : day(exact);
    case "exactFormatDate": {
      if (exact === null) {
        return null;
      }
      const unit = presetUnit(formattingOf(field).date);
      return [startOf(exact, unit, timeZone), endOf(exact, unit, timeZone)];
    }
    case "dateRange": {
      const end = value.exactDateEnd
        ? parseInstant(value.exactDateEnd, timeZone)
        : null;
      if (exact === null || end === null || exact > end) {
        return null;
      }
      return showsTime(field)
        ? [exact, end]
        : [startOf(exact, "day", timeZone), endOf(end, "day", timeZone)];
    }
    case "currentWeek":
      return period("week", 0);
    case "currentMonth":
      return period("month", 0);
    case "currentYear":
      return period("year", 0);
    case "lastWeek":
      return period("week", -1);
    case "lastMonth":
      return period("month", -1);
    case "lastYear":
      return period("year", -1);
    case "nextWeekPeriod":
      return period("week", 1);
    case "nextMonthPeriod":
      return period("month", 1);
    case "nextYearPeriod":
      return period("year", 1);
    case "pastWeek":
      return past("week", 1);
    case "pastMonth":
      return past("month", 1);
    case "pastYear":
      return past("year", 1);
    case "nextWeek":
      return next("week", 1);
    case "nextMonth":
      return next("month", 1);
    case "nextYear":
      return next("year", 1);
    case "pastNumberOfDays":
      return days === null ? null : past("day", days);
    case "nextNumberOfDays":
      return days === null ? null : next("day", days);
    default:
      return null;
  }
}

function validDays(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

function presetUnit(preset: string | undefined): TimeUnit {
  switch (preset) {
    case "YYYY":
      return "year";
    case "YYYY-MM":
    case "MM":
      return "month";
    default:
      return "day";
  }
}

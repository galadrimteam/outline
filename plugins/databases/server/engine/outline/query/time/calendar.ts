import { fromWall, partsOfWall, toWall, wallOf } from "./zone";

/** A calendar or clock unit, as date functions and filters name them. */
export type TimeUnit =
  | "millisecond"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

/** A day of 24 hours, in milliseconds. */
export const DAY = 86_400_000;

const UNIT_SIZES: Partial<Record<TimeUnit, number>> = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: DAY,
  week: 7 * DAY,
};

const UNIT_NAMES: Record<string, TimeUnit> = {
  millisecond: "millisecond",
  milliseconds: "millisecond",
  ms: "millisecond",
  second: "second",
  seconds: "second",
  s: "second",
  sec: "second",
  secs: "second",
  minute: "minute",
  minutes: "minute",
  min: "minute",
  mins: "minute",
  hour: "hour",
  hours: "hour",
  h: "hour",
  hr: "hour",
  hrs: "hour",
  day: "day",
  days: "day",
  d: "day",
  week: "week",
  weeks: "week",
  w: "week",
  month: "month",
  months: "month",
  quarter: "quarter",
  quarters: "quarter",
  q: "quarter",
  year: "year",
  years: "year",
  y: "year",
  yr: "year",
  yrs: "year",
};

/**
 * Reads a unit name the way date functions accept it ("day", "days", "hr"…).
 *
 * @param name the unit name.
 * @param fallback the unit of an unknown or missing name.
 * @returns the unit.
 */
export function parseTimeUnit(
  name: string | null | undefined,
  fallback: TimeUnit
): TimeUnit {
  if (!name) {
    return fallback;
  }
  return UNIT_NAMES[name.trim().toLowerCase()] ?? fallback;
}

/**
 * Returns the first instant of the unit holding an instant, in a zone. Weeks
 * start on Monday.
 *
 * @param ms the instant.
 * @param unit the unit.
 * @param timeZone a valid IANA time zone.
 * @returns the start of the unit.
 */
export function startOf(ms: number, unit: TimeUnit, timeZone: string): number {
  const wall = toWall(ms, timeZone);
  const parts = partsOfWall(wall);
  switch (unit) {
    case "millisecond":
      return ms;
    case "second":
      return fromWall(wall - parts.millisecond, timeZone);
    case "minute":
      return fromWall(
        wallOf(parts.year, parts.month, parts.day, parts.hour, parts.minute),
        timeZone
      );
    case "hour":
      return fromWall(
        wallOf(parts.year, parts.month, parts.day, parts.hour),
        timeZone
      );
    case "day":
      return fromWall(wallOf(parts.year, parts.month, parts.day), timeZone);
    case "week":
      return fromWall(
        wallOf(parts.year, parts.month, parts.day - ((parts.weekday + 6) % 7)),
        timeZone
      );
    case "month":
      return fromWall(wallOf(parts.year, parts.month, 1), timeZone);
    case "quarter":
      return fromWall(
        wallOf(parts.year, Math.floor((parts.month - 1) / 3) * 3 + 1, 1),
        timeZone
      );
    case "year":
      return fromWall(wallOf(parts.year, 1, 1), timeZone);
  }
}

/**
 * Returns the last millisecond of the unit holding an instant, in a zone.
 *
 * @param ms the instant.
 * @param unit the unit.
 * @param timeZone a valid IANA time zone.
 * @returns the end of the unit.
 */
export function endOf(ms: number, unit: TimeUnit, timeZone: string): number {
  return (
    startOf(
      addUnits(startOf(ms, unit, timeZone), 1, unit, timeZone),
      unit,
      timeZone
    ) - 1
  );
}

/**
 * Adds units to an instant. Days and longer units move the wall clock (a day
 * across a daylight saving change keeps the time of day); a month added to
 * the 31st lands on the last day of a shorter month.
 *
 * @param ms the instant.
 * @param amount how many units, may be negative or fractional.
 * @param unit the unit.
 * @param timeZone a valid IANA time zone.
 * @returns the new instant.
 */
export function addUnits(
  ms: number,
  amount: number,
  unit: TimeUnit,
  timeZone: string
): number {
  switch (unit) {
    case "millisecond":
    case "second":
    case "minute":
    case "hour":
      return ms + amount * (UNIT_SIZES[unit] ?? 1);
    case "day":
    case "week":
      return fromWall(
        toWall(ms, timeZone) + amount * (UNIT_SIZES[unit] ?? DAY),
        timeZone
      );
    case "month":
    case "quarter":
    case "year": {
      const months =
        amount * (unit === "month" ? 1 : unit === "quarter" ? 3 : 12);
      const whole = Math.trunc(months);
      const wall = addMonthsToWall(toWall(ms, timeZone), whole);
      return fromWall(wall + (months - whole) * 30 * DAY, timeZone);
    }
  }
}

/**
 * Tells how many units separate two instants, `a - b`, read on the wall clock
 * of a zone: fractional for units up to the week, whole months (a month is
 * complete once the day of the month is reached, or on a month's last day),
 * quarters as months / 3, whole years.
 *
 * @param a the later instant for a positive result.
 * @param b the earlier instant for a positive result.
 * @param unit the unit.
 * @param timeZone a valid IANA time zone.
 * @returns the difference.
 */
export function diffUnits(
  a: number,
  b: number,
  unit: TimeUnit,
  timeZone: string
): number {
  const wallA = toWall(a, timeZone);
  const wallB = toWall(b, timeZone);
  switch (unit) {
    case "month":
      return monthsBetween(wallA, wallB);
    case "quarter":
      return monthsBetween(wallA, wallB) / 3;
    case "year":
      return Math.trunc(monthsBetween(wallA, wallB) / 12);
    default:
      return (wallA - wallB) / (UNIT_SIZES[unit] ?? DAY);
  }
}

/**
 * Returns the ISO 8601 week number of an instant in a zone (weeks start on
 * Monday, week 1 holds the first Thursday of the year).
 *
 * @param ms the instant.
 * @param timeZone a valid IANA time zone.
 * @returns the week number, 1 to 53.
 */
export function isoWeek(ms: number, timeZone: string): number {
  const parts = partsOfWall(toWall(ms, timeZone));
  const thursday = wallOf(
    parts.year,
    parts.month,
    parts.day + 3 - ((parts.weekday + 6) % 7)
  );
  const yearStart = wallOf(partsOfWall(thursday).year, 1, 1);
  return Math.floor((thursday - yearStart) / (7 * DAY)) + 1;
}

/**
 * Returns the number of days of a month.
 *
 * @param year the year.
 * @param month the month, 1 to 12.
 * @returns 28 to 31.
 */
export function daysInMonth(year: number, month: number): number {
  return partsOfWall(wallOf(year, month + 1, 0)).day;
}

function addMonthsToWall(wall: number, months: number): number {
  if (!months) {
    return wall;
  }
  const parts = partsOfWall(wall);
  const target = wallOf(parts.year, parts.month + months, 1);
  const { year, month } = partsOfWall(target);
  return wallOf(
    year,
    month,
    Math.min(parts.day, daysInMonth(year, month)),
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
}

function monthsBetween(wallA: number, wallB: number): number {
  const a = partsOfWall(wallA);
  const b = partsOfWall(wallB);
  const months = (a.year - b.year) * 12 + (a.month - b.month);
  if (months > 0 && a.day < b.day && a.day < daysInMonth(a.year, a.month)) {
    return months - 1;
  }
  if (months < 0 && a.day > b.day && b.day < daysInMonth(b.year, b.month)) {
    return months + 1;
  }
  return months;
}

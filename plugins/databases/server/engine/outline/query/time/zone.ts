/**
 * Instants and wall clocks in IANA time zones, with the platform's Intl data
 * only. A "wall" time is the local date and time of a zone written as if it
 * were UTC milliseconds, so that the UTC getters of a Date read its parts.
 */

const HOUR = 3_600_000;

/** The wall-clock parts of an instant in a zone. */
export interface WallParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** 0 (Sunday) to 6. */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const validZones = new Map<string, boolean>();
// Offsets are uniform within almost every hour, so they are cached per hour of time.
const offsets = new Map<string, Map<number, number>>();
const MAX_CACHED_HOURS = 200_000;

/**
 * Returns the zone to use for a zone name: the name itself when the platform
 * knows it, else UTC.
 *
 * @param timeZone an IANA time zone name.
 * @returns a valid time zone name.
 */
export function safeTimeZone(timeZone: string | undefined | null): string {
  if (!timeZone) {
    return "UTC";
  }
  let valid = validZones.get(timeZone);
  if (valid === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      valid = true;
    } catch (_err) {
      valid = false;
    }
    validZones.set(timeZone, valid);
  }
  return valid ? timeZone : "UTC";
}

/**
 * Returns the offset of a zone from UTC at an instant.
 *
 * @param ms the instant, in UTC milliseconds.
 * @param timeZone a valid IANA time zone.
 * @returns the offset in milliseconds (positive east of Greenwich).
 */
export function zoneOffset(ms: number, timeZone: string): number {
  if (timeZone === "UTC") {
    return 0;
  }
  let cache = offsets.get(timeZone);
  if (!cache) {
    cache = new Map();
    offsets.set(timeZone, cache);
  }
  const bucket = Math.floor(ms / HOUR);
  const cached = cache.get(bucket);
  if (cached !== undefined) {
    return cached;
  }
  const start = bucket * HOUR;
  const atStart = exactOffset(start, timeZone);
  const atEnd = exactOffset(start + HOUR - 1, timeZone);
  if (atStart !== atEnd) {
    return exactOffset(ms, timeZone);
  }
  if (cache.size > MAX_CACHED_HOURS) {
    cache.clear();
  }
  cache.set(bucket, atStart);
  return atStart;
}

/**
 * Returns the wall time of an instant in a zone.
 *
 * @param ms the instant.
 * @param timeZone a valid IANA time zone.
 * @returns the wall time.
 */
export function toWall(ms: number, timeZone: string): number {
  return ms + zoneOffset(ms, timeZone);
}

/**
 * Returns the instant a wall time designates in a zone. A wall time skipped
 * by a daylight saving change is moved forward by the change.
 *
 * @param wall the wall time.
 * @param timeZone a valid IANA time zone.
 * @returns the instant.
 */
export function fromWall(wall: number, timeZone: string): number {
  const first = zoneOffset(wall, timeZone);
  const guess = wall - first;
  const second = zoneOffset(guess, timeZone);
  return second === first ? guess : wall - second;
}

/**
 * Returns the wall-clock parts of an instant in a zone.
 *
 * @param ms the instant.
 * @param timeZone a valid IANA time zone.
 * @returns the parts.
 */
export function wallParts(ms: number, timeZone: string): WallParts {
  return partsOfWall(toWall(ms, timeZone));
}

/**
 * Reads the parts of a wall time.
 *
 * @param wall the wall time.
 * @returns the parts.
 */
export function partsOfWall(wall: number): WallParts {
  const date = new Date(wall);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds(),
    weekday: date.getUTCDay(),
  };
}

/**
 * Builds a wall time from its parts; out of range parts carry over.
 *
 * @param year the year.
 * @param month the month, 1 to 12.
 * @param day the day of the month.
 * @param hour the hour.
 * @param minute the minute.
 * @param second the second.
 * @param millisecond the millisecond.
 * @returns the wall time.
 */
export function wallOf(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

function exactOffset(ms: number, timeZone: string): number {
  const second = ms - mod(ms, 1000);
  const parts = formatter(timeZone).formatToParts(new Date(second));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = wallOf(
    value("year"),
    value("month"),
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second")
  );
  return wall - second;
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  let result = formatters.get(timeZone);
  if (!result) {
    result = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, result);
  }
  return result;
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

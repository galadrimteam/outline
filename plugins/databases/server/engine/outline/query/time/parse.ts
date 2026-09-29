import { daysInMonth } from "./calendar";
import { DATE_LOCALE, monthNames } from "./format";
import { fromWall, wallOf } from "./zone";

const WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

const LOCAL =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/i;

const TOKEN =
  /\[([^\]]*)]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|dd|HH|H|hh|h|mm|m|ss|s|SSS|A|a|ZZ|Z/g;

/** Formats tried after a field's own format: long dates, then European. */
const FALLBACK_FORMATS = ["D MMMM YYYY", "MMMM D, YYYY", "D/M/YYYY"];
const TIME_FORMATS = ["HH:mm:ss", "HH:mm", "hh:mm A"];
const NAME_LOCALES = [DATE_LOCALE, "en"];

interface Pattern {
  regex: RegExp;
  tokens: string[];
}

const patterns = new Map<string, Pattern>();

/**
 * Reads a date typed or computed as text: ISO 8601 with a zone, a local
 * "YYYY-MM-DD[ HH:mm[:ss]]", then the given formats and the usual long and
 * European ones ("1 juillet 2025", "July 1, 2025", "1/7/2025"), each with an
 * optional time. Month names are read in French and English.
 *
 * @param text the text.
 * @param timeZone the zone of a date written without one.
 * @param formats dayjs-style formats to try first (a field's display format).
 * @returns the instant, or null when the text is no date.
 */
export function parseInstant(
  text: string,
  timeZone: string,
  formats: string[] = []
): number | null {
  const value = text.trim();
  if (!value) {
    return null;
  }
  if (WITH_ZONE.test(value)) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  const local = LOCAL.exec(value);
  if (local) {
    return instantOf(
      {
        year: Number(local[1]),
        month: Number(local[2]),
        day: Number(local[3]),
        hour: Number(local[4] ?? 0),
        minute: Number(local[5] ?? 0),
        second: Number(local[6] ?? 0),
        millisecond: Number((local[7] ?? "0").padEnd(3, "0")),
      },
      timeZone
    );
  }
  for (const format of [...formats, ...FALLBACK_FORMATS]) {
    for (const candidate of [
      format,
      ...TIME_FORMATS.map((time) => `${format} ${time}`),
    ]) {
      const ms = parseWithFormat(value, candidate, timeZone);
      if (ms !== null) {
        return ms;
      }
    }
  }
  return null;
}

/**
 * Reads a date written in a dayjs-style format (YYYY, MM, MMMM, D, Do, HH,
 * hh, mm, ss, SSS, A, Z; text between brackets is literal).
 *
 * @param text the text.
 * @param format the format.
 * @param timeZone the zone of a date written without one.
 * @returns the instant, or null when the text does not match.
 */
export function parseWithFormat(
  text: string,
  format: string,
  timeZone: string
): number | null {
  const { regex, tokens } = patternOf(format);
  const match = regex.exec(text.trim());
  if (!match) {
    return null;
  }

  const parts: DateFields = {
    year: 1970,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
  let meridiem: string | undefined;
  let offset: number | undefined;

  for (let index = 0; index < tokens.length; index++) {
    const raw = match[index + 1];
    if (raw === undefined) {
      continue;
    }
    switch (tokens[index]) {
      case "YYYY":
        parts.year = Number(raw);
        break;
      case "YY":
        parts.year = 2000 + Number(raw);
        break;
      case "MMMM":
      case "MMM": {
        const month = monthFromName(raw);
        if (month === null) {
          return null;
        }
        parts.month = month;
        break;
      }
      case "MM":
      case "M":
        parts.month = Number(raw);
        break;
      case "Do":
      case "DD":
      case "D":
        parts.day = Number(raw);
        break;
      case "HH":
      case "H":
      case "hh":
      case "h":
        parts.hour = Number(raw);
        break;
      case "mm":
      case "m":
        parts.minute = Number(raw);
        break;
      case "ss":
      case "s":
        parts.second = Number(raw);
        break;
      case "SSS":
        parts.millisecond = Number(raw.padEnd(3, "0"));
        break;
      case "A":
      case "a":
        meridiem = raw.toLowerCase();
        break;
      case "Z":
      case "ZZ":
        offset = offsetFrom(raw);
        break;
      default:
        break;
    }
  }

  if (meridiem) {
    if (parts.hour < 1 || parts.hour > 12) {
      return null;
    }
    parts.hour = (parts.hour % 12) + (meridiem === "pm" ? 12 : 0);
  }
  if (offset !== undefined) {
    return isValid(parts)
      ? wallOf(
          parts.year,
          parts.month,
          parts.day,
          parts.hour,
          parts.minute,
          parts.second,
          parts.millisecond
        ) - offset
      : null;
  }
  return instantOf(parts, timeZone);
}

interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

function instantOf(parts: DateFields, timeZone: string): number | null {
  if (!isValid(parts)) {
    return null;
  }
  return fromWall(
    wallOf(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond
    ),
    timeZone
  );
}

function isValid(parts: DateFields): boolean {
  return (
    parts.month >= 1 &&
    parts.month <= 12 &&
    parts.day >= 1 &&
    parts.day <= daysInMonth(parts.year, parts.month) &&
    parts.hour >= 0 &&
    parts.hour < 24 &&
    parts.minute >= 0 &&
    parts.minute < 60 &&
    parts.second >= 0 &&
    parts.second < 60
  );
}

function patternOf(format: string): Pattern {
  let pattern = patterns.get(format);
  if (pattern) {
    return pattern;
  }
  const tokens: string[] = [];
  let source = "";
  let last = 0;
  const literal = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

  for (const match of format.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    source += literal(format.slice(last, index));
    last = index + match[0].length;
    if (match[1] !== undefined) {
      source += literal(match[1]);
      continue;
    }
    const token = match[0];
    switch (token) {
      case "YYYY":
        source += "(\\d{4})";
        break;
      case "YY":
        source += "(\\d{2})";
        break;
      case "MMMM":
      case "MMM":
        source += "([^\\d\\s,/:-]+)";
        break;
      case "Do":
        source += "(\\d{1,2})(?:er|st|nd|rd|th)?";
        break;
      case "SSS":
        source += "(\\d{1,3})";
        break;
      case "A":
      case "a":
        source += "(am|pm)";
        break;
      case "Z":
      case "ZZ":
        source += "(Z|[+-]\\d{2}:?\\d{2})";
        break;
      case "dddd":
      case "ddd":
      case "dd":
        source += "(?:[^\\d\\s,]+)";
        continue;
      default:
        source += "(\\d{1,2})";
        break;
    }
    tokens.push(token);
  }
  source += literal(format.slice(last));
  pattern = { regex: new RegExp(`^${source}$`, "i"), tokens };
  patterns.set(format, pattern);
  return pattern;
}

function monthFromName(raw: string): number | null {
  const wanted = comparable(raw);
  for (const locale of NAME_LOCALES) {
    const { months, monthsShort } = monthNames(locale);
    const index = months.findIndex((name) => comparable(name) === wanted);
    if (index >= 0) {
      return index + 1;
    }
    const short = monthsShort.findIndex((name) => comparable(name) === wanted);
    if (short >= 0) {
      return short + 1;
    }
  }
  return null;
}

function comparable(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function offsetFrom(raw: string): number {
  if (raw.toUpperCase() === "Z") {
    return 0;
  }
  const sign = raw.startsWith("-") ? -1 : 1;
  const digits = raw.slice(1).replace(":", "");
  return (
    sign *
    (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) *
    60_000
  );
}

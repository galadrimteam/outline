import { partsOfWall, toWall, zoneOffset } from "./zone";

/**
 * Language of month and day names in formatted dates: the Teable instance
 * Galadrim runs formats server-side text in French (DATE_FORMATTING_LOCALE).
 */
export const DATE_LOCALE = "fr";

interface LocaleNames {
  months: string[];
  monthsShort: string[];
  weekdays: string[];
  weekdaysShort: string[];
}

const TOKEN =
  /\[([^\]]*)]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|A|a|ZZ|Z|Q|X|x/g;

const names = new Map<string, LocaleNames>();

/**
 * Formats an instant with dayjs-style tokens (YYYY, MM, MMMM, D, Do, dddd,
 * HH, hh, mm, ss, A, Z…; text between brackets is kept), on the wall clock of
 * a zone.
 *
 * @param ms the instant.
 * @param format the format.
 * @param timeZone a valid IANA time zone.
 * @param locale the language of month and day names.
 * @returns the text.
 */
export function formatInstant(
  ms: number,
  format: string,
  timeZone: string,
  locale = DATE_LOCALE
): string {
  const parts = partsOfWall(toWall(ms, timeZone));
  const localeNames = namesOf(locale);
  const hour12 = parts.hour % 12 || 12;

  return format.replace(TOKEN, (token: string, escaped: string | undefined) => {
    if (escaped !== undefined) {
      return escaped;
    }
    switch (token) {
      case "YYYY":
        return pad(parts.year, 4);
      case "YY":
        return pad(parts.year % 100, 2);
      case "MMMM":
        return localeNames.months[parts.month - 1];
      case "MMM":
        return localeNames.monthsShort[parts.month - 1];
      case "MM":
        return pad(parts.month, 2);
      case "M":
        return String(parts.month);
      case "Do":
        return ordinal(parts.day, locale);
      case "DD":
        return pad(parts.day, 2);
      case "D":
        return String(parts.day);
      case "dddd":
        return localeNames.weekdays[parts.weekday];
      case "ddd":
        return localeNames.weekdaysShort[parts.weekday];
      case "dd":
        return localeNames.weekdays[parts.weekday].slice(0, 2);
      case "d":
        return String(parts.weekday);
      case "HH":
        return pad(parts.hour, 2);
      case "H":
        return String(parts.hour);
      case "hh":
        return pad(hour12, 2);
      case "h":
        return String(hour12);
      case "mm":
        return pad(parts.minute, 2);
      case "m":
        return String(parts.minute);
      case "ss":
        return pad(parts.second, 2);
      case "s":
        return String(parts.second);
      case "SSS":
        return pad(parts.millisecond, 3);
      case "A":
        return parts.hour < 12 ? "AM" : "PM";
      case "a":
        return parts.hour < 12 ? "am" : "pm";
      case "Z":
        return offsetText(zoneOffset(ms, timeZone), ":");
      case "ZZ":
        return offsetText(zoneOffset(ms, timeZone), "");
      case "Q":
        return String(Math.floor((parts.month - 1) / 3) + 1);
      case "X":
        return String(Math.floor(ms / 1000));
      case "x":
        return String(ms);
      default:
        return token;
    }
  });
}

/**
 * Returns the month names of a language, long and short, to parse dates.
 *
 * @param locale the language.
 * @returns the long names then the short names, January first.
 */
export function monthNames(locale: string): {
  months: string[];
  monthsShort: string[];
} {
  const { months, monthsShort } = namesOf(locale);
  return { months, monthsShort };
}

function namesOf(locale: string): LocaleNames {
  let result = names.get(locale);
  if (!result) {
    const month = (style: "long" | "short") => {
      const format = new Intl.DateTimeFormat(locale, {
        month: style,
        timeZone: "UTC",
      });
      return Array.from({ length: 12 }, (_value, index) =>
        format.format(new Date(Date.UTC(2021, index, 1)))
      );
    };
    const weekday = (style: "long" | "short") => {
      const format = new Intl.DateTimeFormat(locale, {
        weekday: style,
        timeZone: "UTC",
      });
      // 2021-01-03 is a Sunday.
      return Array.from({ length: 7 }, (_value, index) =>
        format.format(new Date(Date.UTC(2021, 0, 3 + index)))
      );
    };
    result = {
      months: month("long"),
      monthsShort: month("short"),
      weekdays: weekday("long"),
      weekdaysShort: weekday("short"),
    };
    names.set(locale, result);
  }
  return result;
}

function ordinal(day: number, locale: string): string {
  if (locale.startsWith("fr")) {
    return day === 1 ? "1er" : String(day);
  }
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function offsetText(offset: number, separator: string): string {
  const minutes = Math.round(Math.abs(offset) / 60_000);
  const sign = offset < 0 ? "-" : "+";
  return `${sign}${pad(Math.floor(minutes / 60), 2)}${separator}${pad(minutes % 60, 2)}`;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

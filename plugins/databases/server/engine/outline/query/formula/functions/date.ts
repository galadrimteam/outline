import type { TimeUnit } from "../../time/calendar";
import {
  addUnits,
  diffUnits,
  isoWeek,
  parseTimeUnit,
  startOf,
} from "../../time/calendar";
import { formatInstant } from "../../time/format";
import { parseInstant, parseWithFormat } from "../../time/parse";
import type { WallParts } from "../../time/zone";
import { wallParts } from "../../time/zone";
import type { Reader } from "../arguments";
import { dateOf, node, numberOf, textOf } from "../arguments";
import type { Compiled, FormulaFunction } from "../compiled";
import { BOOLEAN, DATE, NUMBER, TEXT } from "../values";

const DEFAULT_FORMAT = "YYYY-MM-DD HH:mm";

/** Dates: TODAY, NOW, date parts, DATETIME_DIFF, DATE_ADD, DATETIME_FORMAT, DATETIME_PARSE, WORKDAY… */
export const dateFunctions: Record<string, FormulaFunction> = {
  TODAY: {
    minArgs: 0,
    maxArgs: 0,
    compile: () =>
      node(DATE, (scope) => startOf(scope.now, "day", scope.timeZone)),
  },
  NOW: {
    minArgs: 0,
    maxArgs: 0,
    compile: () => node(DATE, (scope) => scope.now),
  },
  YEAR: part((parts) => parts.year),
  MONTH: part((parts) => parts.month),
  DAY: part((parts) => parts.day),
  HOUR: part((parts) => parts.hour),
  MINUTE: part((parts) => parts.minute),
  SECOND: part((parts) => parts.second),
  WEEKNUM: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([date]) => {
      const d = dateOf(date);
      return node(NUMBER, (scope) => {
        const ms = d(scope);
        return ms === null ? null : isoWeek(ms, scope.timeZone);
      });
    },
  },
  WEEKDAY: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([date, startDay]) => {
      const d = dateOf(date);
      const start = startDay ? textOf(startDay) : () => null;
      return node(NUMBER, (scope) => {
        const ms = d(scope);
        if (ms === null) {
          return null;
        }
        const weekday = wallParts(ms, scope.timeZone).weekday;
        return (start(scope) ?? "").trim().toLowerCase() === "monday"
          ? (weekday + 6) % 7
          : weekday;
      });
    },
  },
  DATETIME_DIFF: {
    minArgs: 2,
    maxArgs: 3,
    compile: ([first, second, unit]) => {
      const a = dateOf(first);
      const b = dateOf(second);
      const u = unitOf(unit, "second");
      return node(NUMBER, (scope) => {
        const start = a(scope);
        const end = b(scope);
        return start === null || end === null
          ? null
          : diffUnits(start, end, u(scope), scope.timeZone);
      });
    },
  },
  DATE_ADD: {
    minArgs: 3,
    maxArgs: 3,
    compile: ([date, count, unit]) => {
      const d = dateOf(date);
      const c = numberOf(count);
      const u = unitOf(unit, "day");
      return node(DATE, (scope) => {
        const ms = d(scope);
        return ms === null
          ? null
          : addUnits(ms, c(scope) ?? 0, u(scope), scope.timeZone);
      });
    },
  },
  DATETIME_FORMAT: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([date, format]) => {
      const d = dateOf(date);
      const f = format ? textOf(format) : () => null;
      return node(TEXT, (scope) => {
        const ms = d(scope);
        return ms === null
          ? null
          : formatInstant(ms, f(scope) || DEFAULT_FORMAT, scope.timeZone);
      });
    },
  },
  DATETIME_PARSE: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([value, format]) => {
      const f = format ? textOf(format) : () => null;
      if (value.type.type === "dateTime") {
        const d = dateOf(value);
        return node(DATE, (scope) => {
          const ms = d(scope);
          const pattern = f(scope);
          if (ms === null || !pattern) {
            return ms;
          }
          return parseWithFormat(
            formatInstant(ms, pattern, scope.timeZone),
            pattern,
            scope.timeZone
          );
        });
      }
      const t = textOf(value);
      return node(DATE, (scope) => {
        const text = t(scope);
        if (text === null) {
          return null;
        }
        const pattern = f(scope);
        return pattern
          ? parseWithFormat(text, pattern, scope.timeZone)
          : parseInstant(text, scope.timeZone);
      });
    },
  },
  DATESTR: formatted("YYYY-MM-DD"),
  TIMESTR: formatted("HH:mm:ss"),
  IS_SAME: dateTest((a, b) => a === b),
  IS_AFTER: dateTest((a, b) => a > b),
  IS_BEFORE: dateTest((a, b) => a < b),
  FROMNOW: sinceNow(),
  TONOW: sinceNow(),
  WORKDAY: {
    minArgs: 2,
    maxArgs: 3,
    compile: ([start, days, holidays]) => {
      const s = dateOf(start);
      const n = numberOf(days);
      const h = holidayReader(holidays);
      return node(DATE, (scope) => {
        const ms = s(scope);
        if (ms === null) {
          return null;
        }
        const off = h(scope);
        const count = Math.trunc(n(scope) ?? 0);
        const step = count < 0 ? -1 : 1;
        let day = ms;
        for (let left = Math.abs(count); left > 0;) {
          day = addUnits(day, step, "day", scope.timeZone);
          if (isWorkday(day, off, scope.timeZone)) {
            left--;
          }
        }
        return day;
      });
    },
  },
  WORKDAY_DIFF: {
    minArgs: 2,
    maxArgs: 3,
    compile: ([start, end, holidays]) => {
      const s = dateOf(start);
      const e = dateOf(end);
      const h = holidayReader(holidays);
      return node(NUMBER, (scope) => {
        const from = s(scope);
        const to = e(scope);
        if (from === null || to === null) {
          return null;
        }
        const off = h(scope);
        const forward =
          startOf(to, "day", scope.timeZone) >=
          startOf(from, "day", scope.timeZone);
        const [low, high] = forward ? [from, to] : [to, from];
        const last = startOf(high, "day", scope.timeZone);
        let count = 0;
        for (
          let day = startOf(
            addUnits(low, 1, "day", scope.timeZone),
            "day",
            scope.timeZone
          );
          day <= last;
          day = addUnits(day, 1, "day", scope.timeZone)
        ) {
          if (isWorkday(day, off, scope.timeZone)) {
            count++;
          }
        }
        return forward ? count : -count;
      });
    },
  },
  CREATED_TIME: {
    minArgs: 0,
    maxArgs: 0,
    compile: () => node(DATE, (scope) => instant(scope.record.createdTime)),
  },
  LAST_MODIFIED_TIME: {
    minArgs: 0,
    compile: () =>
      node(DATE, (scope) => instant(scope.record.lastModifiedTime)),
  },
};

function part(read: (parts: WallParts) => number): FormulaFunction {
  return {
    minArgs: 1,
    maxArgs: 1,
    compile: ([date]) => {
      const d = dateOf(date);
      return node(NUMBER, (scope) => {
        const ms = d(scope);
        return ms === null ? null : read(wallParts(ms, scope.timeZone));
      });
    },
  };
}

function formatted(format: string): FormulaFunction {
  return {
    minArgs: 1,
    maxArgs: 1,
    compile: ([date]) => {
      const d = dateOf(date);
      return node(TEXT, (scope) => {
        const ms = d(scope);
        return ms === null ? null : formatInstant(ms, format, scope.timeZone);
      });
    },
  };
}

function dateTest(test: (a: number, b: number) => boolean): FormulaFunction {
  return {
    minArgs: 2,
    maxArgs: 3,
    compile: ([first, second, unit]) => {
      const a = dateOf(first);
      const b = dateOf(second);
      const u = unit ? unitOf(unit, "day") : () => "millisecond" as const;
      return node(BOOLEAN, (scope) => {
        const x = a(scope);
        const y = b(scope);
        if (x === null || y === null) {
          return null;
        }
        const by = u(scope);
        return test(
          startOf(x, by, scope.timeZone),
          startOf(y, by, scope.timeZone)
        );
      });
    },
  };
}

function sinceNow(): FormulaFunction {
  return {
    minArgs: 1,
    maxArgs: 2,
    compile: ([date, unit]) => {
      const d = dateOf(date);
      const u = unitOf(unit, "day");
      return node(NUMBER, (scope) => {
        const ms = d(scope);
        return ms === null
          ? null
          : Math.abs(diffUnits(scope.now, ms, u(scope), scope.timeZone));
      });
    },
  };
}

function unitOf(
  unit: Compiled | undefined,
  fallback: TimeUnit
): Reader<TimeUnit> {
  if (!unit) {
    return () => fallback;
  }
  if (typeof unit.constant === "string") {
    const known = parseTimeUnit(unit.constant, "day");
    return () => known;
  }
  const text = textOf(unit);
  return (scope) => parseTimeUnit(text(scope), "day");
}

function holidayReader(holidays: Compiled | undefined): Reader<Set<number>> {
  if (!holidays) {
    return () => new Set();
  }
  const text = textOf(holidays);
  return (scope) =>
    new Set(
      (text(scope) ?? "")
        .split(",")
        .map((item) => parseInstant(item, scope.timeZone))
        .filter((item): item is number => item !== null)
        .map((item) => startOf(item, "day", scope.timeZone))
    );
}

function isWorkday(
  day: number,
  holidays: Set<number>,
  timeZone: string
): boolean {
  const weekday = wallParts(day, timeZone).weekday;
  return (
    weekday !== 0 &&
    weekday !== 6 &&
    !holidays.has(startOf(day, "day", timeZone))
  );
}

function instant(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

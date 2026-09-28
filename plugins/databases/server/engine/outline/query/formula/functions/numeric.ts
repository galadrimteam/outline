import type { Reader } from "../arguments";
import { listOf, node, numberOf } from "../arguments";
import type { Compiled, FormulaFunction, FormulaScope } from "../compiled";
import { DATE, NUMBER, toDate, toNumber } from "../values";

type Rounding = "half" | "up" | "down" | "ceiling" | "floor";

/** Arithmetic: SUM, AVERAGE, MAX, MIN, ROUND…, INT, ABS, SQRT, POWER, EXP, LOG, MOD, VALUE. */
export const numericFunctions: Record<string, FormulaFunction> = {
  SUM: {
    minArgs: 1,
    compile: (args) => {
      const numbers = numbersOf(args);
      return node(NUMBER, (scope) =>
        numbers(scope).reduce((sum, value) => sum + value, 0)
      );
    },
  },
  AVERAGE: {
    minArgs: 1,
    compile: (args) => {
      const numbers = numbersOf(args);
      return node(NUMBER, (scope) => {
        const values = numbers(scope);
        return values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null;
      });
    },
  },
  MAX: extremum((a, b) => a > b),
  MIN: extremum((a, b) => a < b),
  ROUND: rounding("half"),
  ROUNDUP: rounding("up"),
  ROUNDDOWN: rounding("down"),
  CEILING: rounding("ceiling"),
  FLOOR: rounding("floor"),
  EVEN: unary((value) => {
    const whole = value > 0 ? Math.ceil(value) : Math.floor(value);
    return whole % 2 === 0 ? whole : whole + Math.sign(whole || 1);
  }),
  ODD: unary((value) => {
    const whole = value > 0 ? Math.ceil(value) : Math.floor(value);
    if (Math.abs(whole % 2) === 1) {
      return whole;
    }
    return whole >= 0 ? whole + 1 : whole - 1;
  }),
  INT: unary(Math.floor),
  ABS: unary(Math.abs),
  SQRT: unary((value) => (value < 0 ? null : Math.sqrt(value))),
  EXP: unary(Math.exp),
  POWER: {
    minArgs: 2,
    maxArgs: 2,
    compile: ([base, exponent]) => {
      const b = numberOf(base);
      const e = numberOf(exponent);
      return node(NUMBER, (scope) => {
        const value = b(scope);
        return value === null ? null : finite(value ** (e(scope) ?? 1));
      });
    },
  },
  LOG: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([value, base]) => {
      const v = numberOf(value);
      const b = base ? numberOf(base) : () => 10;
      return node(NUMBER, (scope) => {
        const number = v(scope);
        const radix = b(scope) ?? 10;
        if (number === null || number <= 0 || radix <= 0 || radix === 1) {
          return null;
        }
        return finite(Math.log(number) / Math.log(radix));
      });
    },
  },
  MOD: {
    minArgs: 2,
    maxArgs: 2,
    compile: ([dividend, divisor]) => {
      const a = numberOf(dividend);
      const b = numberOf(divisor);
      return node(NUMBER, (scope) => {
        const value = a(scope);
        const by = b(scope);
        return value === null || !by ? null : value % by;
      });
    },
  },
  VALUE: unary((value) => value),
};

/**
 * Rounds a number to decimal places the way PostgreSQL rounds a decimal:
 * binary noise is dropped first (1.005 rounds to 1.01), halves go away from
 * zero.
 *
 * @param value the number.
 * @param places the decimal places, may be negative.
 * @param mode half (ROUND), away from zero (ROUNDUP), toward zero
 * (ROUNDDOWN), up (CEILING) or down (FLOOR).
 * @returns the rounded number.
 */
export function roundNumber(
  value: number,
  places: number,
  mode: Rounding
): number {
  const digits = Math.trunc(places);
  const factor = 10 ** Math.abs(digits);
  const scale = (number: number) =>
    digits >= 0 ? number * factor : number / factor;
  const unscale = (number: number) =>
    digits >= 0 ? number / factor : number * factor;
  const scaled = Number(scale(value).toPrecision(15));
  const sign = scaled < 0 ? -1 : 1;
  const magnitude = Math.abs(scaled);
  let rounded: number;
  switch (mode) {
    case "half":
      rounded = sign * Math.round(magnitude);
      break;
    case "up":
      rounded = sign * Math.ceil(magnitude);
      break;
    case "down":
      rounded = sign * Math.trunc(magnitude);
      break;
    case "ceiling":
      rounded = Math.ceil(scaled);
      break;
    case "floor":
      rounded = Math.floor(scaled);
      break;
  }
  return unscale(rounded || 0);
}

/**
 * Reads the numbers of arguments, lists flattened, blanks and text that is no
 * number left out.
 *
 * @param args the arguments.
 * @returns the reader.
 */
export function numbersOf(args: Compiled[]): Reader<number[]> {
  const lists = args.map((arg) => ({ arg, list: listOf(arg) }));
  return (scope) =>
    lists.flatMap(({ arg, list }) =>
      list(scope)
        .map((item) => toNumber(item, arg.type.type))
        .filter((item): item is number => item !== null)
    );
}

function rounding(mode: Rounding): FormulaFunction {
  return {
    minArgs: 1,
    maxArgs: 2,
    compile: ([value, places]) => {
      const v = numberOf(value);
      const p = places ? numberOf(places) : () => 0;
      return node(NUMBER, (scope) => {
        const number = v(scope);
        return number === null
          ? null
          : finite(roundNumber(number, p(scope) ?? 0, mode));
      });
    },
  };
}

function unary(operation: (value: number) => number | null): FormulaFunction {
  return {
    minArgs: 1,
    maxArgs: 1,
    compile: ([value]) => {
      const v = numberOf(value);
      return node(NUMBER, (scope) => {
        const number = v(scope);
        if (number === null) {
          return null;
        }
        const result = operation(number);
        return result === null ? null : finite(result);
      });
    },
  };
}

function extremum(better: (a: number, b: number) => boolean): FormulaFunction {
  return {
    minArgs: 1,
    compile: (args) => {
      const type = args[0].type.type === "dateTime" ? DATE : NUMBER;
      const lists = args.map((arg) => ({ arg, list: listOf(arg) }));
      const read = (scope: FormulaScope) =>
        lists.flatMap(({ arg, list }) =>
          list(scope)
            .map((item) =>
              type === DATE
                ? toDate(item, arg.type.type, scope.timeZone)
                : toNumber(item, arg.type.type)
            )
            .filter((item): item is number => item !== null)
        );
      return node(type, (scope) =>
        read(scope).reduce<number | null>(
          (best, value) =>
            best === null || better(value, best) ? value : best,
          null
        )
      );
    },
  };
}

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

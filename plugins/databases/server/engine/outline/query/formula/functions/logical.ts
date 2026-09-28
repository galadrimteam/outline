import { node, textOf, truthOf } from "../arguments";
import type { Reader } from "../arguments";
import type { Compiled, FormulaFunction, FormulaScope } from "../compiled";
import { compileComparison } from "../compare";
import type { Value, ValueType } from "../values";
import {
  BOOLEAN,
  FormulaRuntimeError,
  TEXT,
  convertValue,
  isTruthy,
} from "../values";

/** BLANK(): nothing, typed as text, and ignored when an IF decides its type. */
export const BLANK_NODE: Compiled = {
  type: TEXT,
  isBlank: true,
  run: () => null,
};

/** Conditions and choices: IF, SWITCH, AND, OR, XOR, NOT, BLANK, ERROR, IS_ERROR. */
export const logicalFunctions: Record<string, FormulaFunction> = {
  IF: {
    minArgs: 2,
    maxArgs: 3,
    compile: ([condition, yes, no = BLANK_NODE]) => {
      const type = branchType([yes, no]);
      const truth = truthOf(condition);
      const whenTrue = converted(yes, type);
      const whenFalse = converted(no, type);
      return node(type, (scope) =>
        truth(scope) ? whenTrue(scope) : whenFalse(scope)
      );
    },
  },
  SWITCH: {
    minArgs: 2,
    compile: ([expression, ...rest]) => {
      const fallback =
        rest.length % 2 === 1 ? rest[rest.length - 1] : BLANK_NODE;
      const cases: { matches: Reader<boolean>; result: Compiled }[] = [];
      for (let index = 0; index + 1 < rest.length; index += 2) {
        cases.push({
          matches: compileComparison("=", expression, rest[index]),
          result: rest[index + 1],
        });
      }
      const type = branchType([...cases.map((item) => item.result), fallback]);
      const results = cases.map((item) => ({
        matches: item.matches,
        value: converted(item.result, type),
      }));
      const otherwise = converted(fallback, type);
      return node(type, (scope) => {
        const found = results.find((item) => item.matches(scope));
        return found ? found.value(scope) : otherwise(scope);
      });
    },
  },
  AND: {
    minArgs: 1,
    compile: (args) => {
      const readers = args.map(allTrue);
      return node(BOOLEAN, (scope) => readers.every((read) => read(scope)));
    },
  },
  OR: {
    minArgs: 1,
    compile: (args) => {
      const readers = args.map(truthyCount);
      return node(BOOLEAN, (scope) => readers.some((read) => read(scope) > 0));
    },
  },
  XOR: {
    minArgs: 1,
    compile: (args) => {
      const readers = args.map(truthyCount);
      return node(
        BOOLEAN,
        (scope) => readers.reduce((sum, read) => sum + read(scope), 0) % 2 === 1
      );
    },
  },
  NOT: {
    minArgs: 1,
    maxArgs: 1,
    compile: ([value]) => {
      const truth = truthOf(value);
      return node(BOOLEAN, (scope) => !truth(scope));
    },
  },
  BLANK: {
    minArgs: 0,
    maxArgs: 0,
    compile: () => BLANK_NODE,
  },
  ERROR: {
    minArgs: 0,
    maxArgs: 1,
    compile: ([message]) => {
      const text = message ? textOf(message) : () => null;
      return node(TEXT, (scope) => {
        throw new FormulaRuntimeError(text(scope) ?? "#ERROR!");
      });
    },
  },
  IS_ERROR: {
    minArgs: 1,
    maxArgs: 1,
    compile: ([value]) =>
      node(BOOLEAN, (scope) => {
        try {
          value.run(scope);
          return false;
        } catch (_err) {
          return true;
        }
      }),
  },
};

/**
 * The type of a choice between values, as Teable types IF and SWITCH: blanks
 * aside, one type when all agree (a list when all are lists), else text.
 *
 * @param branches the values chosen from.
 * @returns the type.
 */
export function branchType(branches: Compiled[]): ValueType {
  const typed = branches.filter((branch) => !branch.isBlank);
  if (!typed.length) {
    return TEXT;
  }
  const [first] = typed;
  if (typed.every((branch) => branch.type.type === first.type.type)) {
    return {
      type: first.type.type,
      isMultiple: typed.every((branch) => branch.type.isMultiple),
    };
  }
  return TEXT;
}

function converted(
  branch: Compiled,
  type: ValueType
): (scope: FormulaScope) => Value {
  return (scope) =>
    convertValue(
      branch.run(scope),
      branch.type,
      type,
      scope.timeZone,
      branch.field
    );
}

function allTrue(arg: Compiled): Reader<boolean> {
  if (!arg.type.isMultiple) {
    return truthOf(arg);
  }
  const element: ValueType = { type: arg.type.type, isMultiple: false };
  return (scope) => {
    const value = arg.run(scope);
    if (value === null) {
      return false;
    }
    const items = Array.isArray(value) ? value : [value];
    return items.every((item) => isTruthy(item, element));
  };
}

function truthyCount(arg: Compiled): Reader<number> {
  const element: ValueType = { type: arg.type.type, isMultiple: false };
  return (scope) => {
    const value = arg.run(scope);
    if (value === null) {
      return 0;
    }
    const items = Array.isArray(value) ? value : [value];
    return items.filter((item) => isTruthy(item, element)).length;
  };
}

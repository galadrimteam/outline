import type { Compiled, FormulaScope } from "./compiled";
import type { Scalar, Value, ValueType } from "./values";
import { isTruthy, toDate, toNumber, toScalar, toText } from "./values";

/** Reads an argument when the function runs. */
export type Reader<T> = (scope: FormulaScope) => T;

/**
 * Builds a compiled node.
 *
 * @param type the type it gives.
 * @param run what it computes.
 * @returns the node.
 */
export function node(
  type: ValueType,
  run: (scope: FormulaScope) => Value
): Compiled {
  return { type, run };
}

/**
 * Reads an argument as a number (a list of one counts as its element).
 *
 * @param arg the argument.
 * @returns the reader.
 */
export function numberOf(arg: Compiled): Reader<number | null> {
  return (scope) =>
    toNumber(toScalar(arg.run(scope), arg.type, arg.field), arg.type.type);
}

/**
 * Reads an argument as text; a list gives its texts joined by ", ".
 *
 * @param arg the argument.
 * @returns the reader.
 */
export function textOf(arg: Compiled): Reader<string | null> {
  return (scope) => {
    const value = arg.run(scope);
    if (Array.isArray(value)) {
      const texts = value
        .map((item) => toText(item, arg.type.type, arg.field))
        .filter((item): item is string => item !== null);
      return texts.length ? texts.join(", ") : null;
    }
    return toText(value, arg.type.type, arg.field);
  };
}

/**
 * Reads an argument as an instant; text is parsed in the scope's zone.
 *
 * @param arg the argument.
 * @returns the reader.
 */
export function dateOf(arg: Compiled): Reader<number | null> {
  return (scope) =>
    toDate(
      toScalar(arg.run(scope), arg.type, arg.field),
      arg.type.type,
      scope.timeZone
    );
}

/**
 * Reads an argument as a condition.
 *
 * @param arg the argument.
 * @returns the reader.
 */
export function truthOf(arg: Compiled): Reader<boolean> {
  return (scope) => isTruthy(arg.run(scope), arg.type);
}

/**
 * Reads an argument as a list of scalars: a list as it is, one value as a
 * list of one, nothing as an empty list.
 *
 * @param arg the argument.
 * @returns the reader.
 */
export function listOf(arg: Compiled): Reader<Scalar[]> {
  return (scope) => {
    const value = arg.run(scope);
    if (value === null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  };
}

/**
 * Reads the text of a literal argument, known when compiling (a unit, a
 * format), or undefined when the argument is computed.
 *
 * @param arg the argument, if given.
 * @returns the text.
 */
export function constantText(arg: Compiled | undefined): string | undefined {
  return typeof arg?.constant === "string" ? arg.constant : undefined;
}

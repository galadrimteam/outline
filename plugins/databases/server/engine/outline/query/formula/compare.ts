import type { Reader } from "./arguments";
import { dateOf, numberOf, textOf } from "./arguments";
import type { Compiled } from "./compiled";
import { isEmptyValue } from "./values";

/** An operator comparing two values. */
export type Comparison = "=" | "!=" | "<" | ">" | "<=" | ">=";

/**
 * Builds the comparison of two formula values, the way Teable compares them:
 * against BLANK() it tests emptiness; dates compare as instants (text is
 * parsed) and nothing is never before or after anything; numbers compare as
 * numbers with blanks worth 0; text compares exactly, a blank being "".
 *
 * @param operator the comparison.
 * @param left the left operand.
 * @param right the right operand.
 * @returns the reader of the result.
 */
export function compileComparison(
  operator: Comparison,
  left: Compiled,
  right: Compiled
): Reader<boolean> {
  if (left.isBlank || right.isBlank) {
    const other = left.isBlank ? right : left;
    switch (operator) {
      case "=":
        return (scope) => isEmptyValue(other.run(scope));
      case "!=":
        return (scope) => !isEmptyValue(other.run(scope));
      default:
        return () => false;
    }
  }

  const leftType = left.type.type;
  const rightType = right.type.type;
  if (leftType === "dateTime" || rightType === "dateTime") {
    const a = dateOf(left);
    const b = dateOf(right);
    return (scope) => compareInstants(operator, a(scope), b(scope));
  }

  const leftNumeric = isNumeric(leftType);
  const rightNumeric = isNumeric(rightType);
  if (leftNumeric && rightNumeric) {
    const a = numberOf(left);
    const b = numberOf(right);
    return (scope) => compareNumbers(operator, a(scope) ?? 0, b(scope) ?? 0);
  }

  if (leftNumeric || rightNumeric) {
    const readNumber = numberOf(leftNumeric ? left : right);
    const readText = textOf(leftNumeric ? right : left);
    return (scope) => {
      const number = readNumber(scope);
      const text = readText(scope) ?? "";
      const parsed = text.trim() === "" ? NaN : Number(text);
      if (!Number.isNaN(parsed)) {
        const value = number ?? 0;
        return leftNumeric
          ? compareNumbers(operator, value, parsed)
          : compareNumbers(operator, parsed, value);
      }
      const written = number === null ? "" : String(number);
      return leftNumeric
        ? compareTexts(operator, written, text)
        : compareTexts(operator, text, written);
    };
  }

  const a = textOf(left);
  const b = textOf(right);
  return (scope) => compareTexts(operator, a(scope) ?? "", b(scope) ?? "");
}

function isNumeric(type: string): boolean {
  return type === "number" || type === "boolean";
}

function compareInstants(
  operator: Comparison,
  a: number | null,
  b: number | null
): boolean {
  if (a === null || b === null) {
    if (operator === "=") {
      return a === b;
    }
    return operator === "!=" ? a !== b : false;
  }
  return compareNumbers(operator, a, b);
}

function compareNumbers(operator: Comparison, a: number, b: number): boolean {
  switch (operator) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
  }
}

function compareTexts(operator: Comparison, a: string, b: string): boolean {
  switch (operator) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
  }
}

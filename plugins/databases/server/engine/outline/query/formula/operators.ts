import { diffUnits } from "../time/calendar";
import { dateOf, node, numberOf, textOf, truthOf } from "./arguments";
import type { BinaryOperator } from "./ast";
import type { Compiled } from "./compiled";
import { compileComparison } from "./compare";
import { BOOLEAN, NUMBER, TEXT } from "./values";

/**
 * Builds a binary operation. Arithmetic counts a blank as 0 and a division by
 * zero or blank gives nothing; `+` adds two numbers and joins anything else
 * as text; `&` joins text; `-` between two dates gives days; comparisons and
 * `&&` / `||` give booleans.
 *
 * @param operator the operator.
 * @param left the left operand.
 * @param right the right operand.
 * @returns the node.
 */
export function compileBinary(
  operator: BinaryOperator,
  left: Compiled,
  right: Compiled
): Compiled {
  switch (operator) {
    case "+":
      return left.type.type === "number" && right.type.type === "number"
        ? arithmetic(left, right, (a, b) => a + b)
        : concatenate(left, right);
    case "-":
      return left.type.type === "dateTime" && right.type.type === "dateTime"
        ? daysBetween(left, right)
        : arithmetic(left, right, (a, b) => a - b);
    case "*":
      return arithmetic(left, right, (a, b) => a * b);
    case "/":
      return divide(left, right, (a, b) => a / b);
    case "%":
      return divide(left, right, (a, b) => a % b);
    case "&":
      return concatenate(left, right);
    case "&&": {
      const a = truthOf(left);
      const b = truthOf(right);
      return node(BOOLEAN, (scope) => a(scope) && b(scope));
    }
    case "||": {
      const a = truthOf(left);
      const b = truthOf(right);
      return node(BOOLEAN, (scope) => a(scope) || b(scope));
    }
    default: {
      const compare = compileComparison(operator, left, right);
      return node(BOOLEAN, compare);
    }
  }
}

/**
 * Builds the negation of a number; a blank stays blank.
 *
 * @param operand the operand.
 * @returns the node.
 */
export function compileNegate(operand: Compiled): Compiled {
  const value = numberOf(operand);
  return node(NUMBER, (scope) => {
    const number = value(scope);
    return number === null ? null : -number;
  });
}

function arithmetic(
  left: Compiled,
  right: Compiled,
  operation: (a: number, b: number) => number
): Compiled {
  const a = numberOf(left);
  const b = numberOf(right);
  return node(NUMBER, (scope) =>
    finite(operation(a(scope) ?? 0, b(scope) ?? 0))
  );
}

function divide(
  left: Compiled,
  right: Compiled,
  operation: (a: number, b: number) => number
): Compiled {
  const a = numberOf(left);
  const b = numberOf(right);
  return node(NUMBER, (scope) => {
    const divisor = b(scope);
    return divisor ? finite(operation(a(scope) ?? 0, divisor)) : null;
  });
}

function concatenate(left: Compiled, right: Compiled): Compiled {
  const a = textOf(left);
  const b = textOf(right);
  return node(TEXT, (scope) => (a(scope) ?? "") + (b(scope) ?? ""));
}

function daysBetween(left: Compiled, right: Compiled): Compiled {
  const a = dateOf(left);
  const b = dateOf(right);
  return node(NUMBER, (scope) => {
    const start = a(scope);
    const end = b(scope);
    return start === null || end === null
      ? null
      : diffUnits(start, end, "day", scope.timeZone);
  });
}

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

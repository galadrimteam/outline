import type { FormulaFunction } from "../compiled";
import { arrayFunctions } from "./array";
import { dateFunctions } from "./date";
import { logicalFunctions } from "./logical";
import { numericFunctions } from "./numeric";
import { systemFunctions } from "./system";
import { textFunctions } from "./text";

const FUNCTIONS: Record<string, FormulaFunction> = {
  ...logicalFunctions,
  ...numericFunctions,
  ...textFunctions,
  ...dateFunctions,
  ...arrayFunctions,
  ...systemFunctions,
};

const ALIASES: Record<string, string> = {
  ISERROR: "IS_ERROR",
  ARRAYJOIN: "ARRAY_JOIN",
  ARRAYUNIQUE: "ARRAY_UNIQUE",
  ARRAYFLATTEN: "ARRAY_FLATTEN",
  ARRAYCOMPACT: "ARRAY_COMPACT",
};

/**
 * Finds a function of the formula language by name, case ignored.
 *
 * @param name the function name.
 * @returns the function, or undefined when the language has none of that name.
 */
export function findFunction(name: string): FormulaFunction | undefined {
  const upper = name.toUpperCase();
  const canonical = ALIASES[upper] ?? upper;
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, canonical)
    ? FUNCTIONS[canonical]
    : undefined;
}

/**
 * Lists the names of the functions of the formula language.
 *
 * @returns the names, aliases included.
 */
export function functionNames(): string[] {
  return [...Object.keys(FUNCTIONS), ...Object.keys(ALIASES)];
}

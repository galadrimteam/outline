import { node } from "../arguments";
import type { FormulaFunction } from "../compiled";
import { NUMBER, TEXT } from "../values";

/** The record itself: RECORD_ID, AUTO_NUMBER. */
export const systemFunctions: Record<string, FormulaFunction> = {
  RECORD_ID: {
    minArgs: 0,
    maxArgs: 0,
    compile: () => node(TEXT, (scope) => scope.record.id),
  },
  AUTO_NUMBER: {
    minArgs: 0,
    maxArgs: 0,
    compile: () => node(NUMBER, (scope) => scope.record.autoNumber),
  },
};

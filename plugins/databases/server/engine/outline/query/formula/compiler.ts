import type { FormulaNode } from "./ast";
import { FormulaError } from "./ast";
import type { Compiled, FieldResolver } from "./compiled";
import { findFunction } from "./functions";
import { compileBinary, compileNegate } from "./operators";
import { parseFormula } from "./parser";
import { BOOLEAN, NUMBER, TEXT, valueOfCell } from "./values";

/**
 * Compiles a parsed formula into a node that runs for one record at a time,
 * typing every node on the way (Teable's inference: `&` is text, a
 * comparison a boolean, a date function a date, a list field a list…).
 *
 * @param node the parsed formula.
 * @param resolve finds the fields `{references}` designate.
 * @returns the compiled root.
 * @throws FormulaError on an unknown field or function, or a wrong number of arguments.
 */
export function compileNode(
  node: FormulaNode,
  resolve: FieldResolver
): Compiled {
  switch (node.kind) {
    case "string":
      return { type: TEXT, constant: node.value, run: () => node.value };
    case "number":
      return { type: NUMBER, constant: node.value, run: () => node.value };
    case "boolean":
      return { type: BOOLEAN, constant: node.value, run: () => node.value };
    case "field": {
      const field = resolve(node.reference);
      if (!field) {
        throw new FormulaError(`Unknown field {${node.reference}}`);
      }
      const id = field.id;
      return {
        type: {
          type: field.cellValueType,
          isMultiple: field.isMultipleCellValue,
        },
        field,
        run: (scope) => valueOfCell(scope.cells[id], field),
      };
    }
    case "negate":
      return compileNegate(compileNode(node.operand, resolve));
    case "binary":
      return compileBinary(
        node.operator,
        compileNode(node.left, resolve),
        compileNode(node.right, resolve)
      );
    case "call": {
      const fn = findFunction(node.name);
      if (!fn) {
        throw new FormulaError(`Unknown function ${node.name}`);
      }
      const count = node.args.length;
      if (count < fn.minArgs) {
        throw new FormulaError(
          `${node.name} needs at least ${fn.minArgs} argument${fn.minArgs > 1 ? "s" : ""}`
        );
      }
      if (fn.maxArgs !== undefined && count > fn.maxArgs) {
        throw new FormulaError(
          `${node.name} takes at most ${fn.maxArgs} argument${fn.maxArgs > 1 ? "s" : ""}`
        );
      }
      return fn.compile(node.args.map((arg) => compileNode(arg, resolve)));
    }
  }
}

/**
 * Parses and compiles a formula.
 *
 * @param expression the formula, in Teable's language.
 * @param resolve finds the fields `{references}` designate.
 * @returns the compiled root.
 * @throws FormulaError when the formula cannot be read or compiled.
 */
export function compileFormula(
  expression: string,
  resolve: FieldResolver
): Compiled {
  return compileNode(parseFormula(expression), resolve);
}

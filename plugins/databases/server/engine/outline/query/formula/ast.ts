/** Binary operators of the formula language. */
export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "&"
  | "="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "&&"
  | "||";

/** A node of a parsed formula. */
export type FormulaNode =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  /** `{fldXXX}`: the reference between the braces. */
  | { kind: "field"; reference: string }
  | { kind: "call"; name: string; args: FormulaNode[] }
  | { kind: "negate"; operand: FormulaNode }
  | {
      kind: "binary";
      operator: BinaryOperator;
      left: FormulaNode;
      right: FormulaNode;
    };

/** Why a formula cannot be read or computed: syntax, unknown field or function. */
export class FormulaError extends Error {}

/**
 * Lists the field references of a formula, each once.
 *
 * @param node the root of the formula.
 * @returns the references, in order of appearance.
 */
export function fieldReferences(node: FormulaNode): string[] {
  const references = new Set<string>();
  const visit = (current: FormulaNode) => {
    switch (current.kind) {
      case "field":
        references.add(current.reference);
        break;
      case "call":
        current.args.forEach(visit);
        break;
      case "negate":
        visit(current.operand);
        break;
      case "binary":
        visit(current.left);
        visit(current.right);
        break;
      default:
        break;
    }
  };
  visit(node);
  return Array.from(references);
}

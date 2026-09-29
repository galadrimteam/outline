import type { BinaryOperator, FormulaNode } from "./ast";
import { FormulaError } from "./ast";
import type { Token } from "./lexer";
import { tokenize } from "./lexer";

/** Binary operators from the loosest to the tightest, as Teable's grammar ranks them. */
const LEVELS: string[][] = [
  ["&"],
  ["||"],
  ["&&"],
  ["=", "==", "!=", "<>"],
  ["<", ">", "<=", ">="],
  ["+", "-"],
  ["*", "/", "%"],
];

const OPERATORS: Record<string, BinaryOperator> = {
  "&": "&",
  "||": "||",
  "&&": "&&",
  "=": "=",
  "==": "=",
  "!=": "!=",
  "<>": "!=",
  "<": "<",
  ">": ">",
  "<=": "<=",
  ">=": ">=",
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "%": "%",
};

/**
 * Parses a formula written in Teable's language: `{fieldId}` references,
 * numbers, strings, TRUE and FALSE, function calls, parentheses, unary minus
 * and the binary operators `* / % + - < > <= >= = != && || &` (`&` binds
 * loosest).
 *
 * @param source the formula.
 * @returns the root node.
 * @throws FormulaError when the formula is not well formed.
 */
export function parseFormula(source: string): FormulaNode {
  const parser = new Parser(tokenize(source));
  return parser.parse();
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  /**
   * Reads the whole formula.
   *
   * @returns the root node.
   * @throws FormulaError when tokens are left over or missing.
   */
  public parse(): FormulaNode {
    if (this.peek().type === "end") {
      throw new FormulaError("The formula is empty");
    }
    const node = this.binary(0);
    const token = this.peek();
    if (token.type !== "end") {
      throw new FormulaError(
        `Unexpected ${describe(token)} at ${token.position + 1}`
      );
    }
    return node;
  }

  private binary(level: number): FormulaNode {
    if (level === LEVELS.length) {
      return this.unary();
    }
    let left = this.binary(level + 1);
    for (;;) {
      const token = this.peek();
      if (token.type !== "operator" || !LEVELS[level].includes(token.value)) {
        return left;
      }
      this.index++;
      const right = this.binary(level + 1);
      left = { kind: "binary", operator: OPERATORS[token.value], left, right };
    }
  }

  private unary(): FormulaNode {
    const token = this.peek();
    if (token.type === "operator" && token.value === "-") {
      this.index++;
      return { kind: "negate", operand: this.unary() };
    }
    if (token.type === "operator" && token.value === "+") {
      this.index++;
      return this.unary();
    }
    return this.primary();
  }

  private primary(): FormulaNode {
    const token = this.next();
    switch (token.type) {
      case "number":
        return { kind: "number", value: token.value };
      case "string":
        return { kind: "string", value: token.value };
      case "field":
        return { kind: "field", reference: token.value };
      case "open": {
        const node = this.binary(0);
        this.expect("close");
        return node;
      }
      case "identifier": {
        if (this.peek().type === "open") {
          this.index++;
          return {
            kind: "call",
            name: token.value.toUpperCase(),
            args: this.args(),
          };
        }
        const upper = token.value.toUpperCase();
        if (upper === "TRUE" || upper === "FALSE") {
          return { kind: "boolean", value: upper === "TRUE" };
        }
        throw new FormulaError(
          `Unknown name « ${token.value} » at ${token.position + 1}`
        );
      }
      default:
        throw new FormulaError(
          `Unexpected ${describe(token)} at ${token.position + 1}`
        );
    }
  }

  private args(): FormulaNode[] {
    const args: FormulaNode[] = [];
    if (this.peek().type === "close") {
      this.index++;
      return args;
    }
    for (;;) {
      args.push(this.binary(0));
      const token = this.next();
      if (token.type === "close") {
        return args;
      }
      if (token.type !== "comma") {
        throw new FormulaError(
          `Expected « , » or « ) » at ${token.position + 1}`
        );
      }
    }
  }

  private expect(type: Token["type"]) {
    const token = this.next();
    if (token.type !== type) {
      throw new FormulaError(`Expected « ) » at ${token.position + 1}`);
    }
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (token.type !== "end") {
      this.index++;
    }
    return token;
  }
}

function describe(token: Token): string {
  switch (token.type) {
    case "end":
      return "end of formula";
    case "open":
      return "« ( »";
    case "close":
      return "« ) »";
    case "comma":
      return "« , »";
    case "number":
      return `number ${token.value}`;
    case "string":
      return "text";
    case "field":
      return `field {${token.value}}`;
    default:
      return `« ${token.value} »`;
  }
}

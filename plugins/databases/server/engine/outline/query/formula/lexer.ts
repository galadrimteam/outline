import { FormulaError } from "./ast";

/** A lexical unit of a formula. */
export type Token =
  | { type: "number"; value: number; position: number }
  | { type: "string"; value: string; position: number }
  | { type: "field"; value: string; position: number }
  | { type: "identifier"; value: string; position: number }
  | { type: "operator"; value: string; position: number }
  | { type: "open" | "close" | "comma" | "end"; position: number };

const OPERATORS = [
  "&&",
  "||",
  "<=",
  ">=",
  "!=",
  "<>",
  "==",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
];

const NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENTIFIER = /^[A-Za-z_\u00A1-\uFFFF][A-Za-z0-9_\u00A1-\uFFFF]*/;

const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

/**
 * Splits a formula into tokens: numbers, "strings" and 'strings' with
 * backslash escapes, `{field}` references, names, operators, parentheses and
 * commas. Blanks and comments are skipped.
 *
 * @param source the formula.
 * @returns the tokens, ending with an "end" token.
 * @throws FormulaError on a character the language does not know.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const rest = source.slice(index);

    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) {
        throw new FormulaError("Unterminated comment");
      }
      index = end + 2;
      continue;
    }
    if (rest.startsWith("//")) {
      const end = source.indexOf("\n", index);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const { value, end } = readString(source, index);
      tokens.push({ type: "string", value, position: index });
      index = end;
      continue;
    }
    if (char === "{") {
      const end = source.indexOf("}", index);
      if (end < 0) {
        throw new FormulaError(`Unclosed field reference at ${index + 1}`);
      }
      tokens.push({
        type: "field",
        value: source.slice(index + 1, end).trim(),
        position: index,
      });
      index = end + 1;
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      tokens.push({
        type: "number",
        value: Number(number[0]),
        position: index,
      });
      index += number[0].length;
      continue;
    }
    const identifier = IDENTIFIER.exec(rest);
    if (identifier) {
      tokens.push({
        type: "identifier",
        value: identifier[0],
        position: index,
      });
      index += identifier[0].length;
      continue;
    }
    if (char === "(" || char === ")" || char === ",") {
      tokens.push({
        type: char === "(" ? "open" : char === ")" ? "close" : "comma",
        position: index,
      });
      index++;
      continue;
    }
    const operator = OPERATORS.find((candidate) => rest.startsWith(candidate));
    if (!operator) {
      throw new FormulaError(
        `Unexpected character « ${char} » at ${index + 1}`
      );
    }
    tokens.push({ type: "operator", value: operator, position: index });
    index += operator.length;
  }

  tokens.push({ type: "end", position: source.length });
  return tokens;
}

function readString(
  source: string,
  start: number
): { value: string; end: number } {
  const quote = source[start];
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === quote) {
      return { value, end: index + 1 };
    }
    if (char === "\\" && index + 1 < source.length) {
      const next = source[index + 1];
      value += ESCAPES[next] ?? `\\${next}`;
      index += 2;
      continue;
    }
    value += char;
    index++;
  }
  throw new FormulaError(`Unterminated string at ${start + 1}`);
}

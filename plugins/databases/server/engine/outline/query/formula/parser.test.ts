import { FormulaError, fieldReferences } from "./ast";
import { tokenize } from "./lexer";
import { parseFormula } from "./parser";

describe("tokenize", () => {
  it("reads strings with escapes, field references and comments", () => {
    const tokens = tokenize(`"a\\"b" & 'c\\n' /* note */ & {fld1} // end`);
    expect(tokens.map((token) => token.type)).toEqual([
      "string",
      "operator",
      "string",
      "operator",
      "field",
      "end",
    ]);
    expect(tokens[0]).toMatchObject({ value: 'a"b' });
    expect(tokens[2]).toMatchObject({ value: "c\n" });
    expect(tokens[4]).toMatchObject({ value: "fld1" });
  });

  it("reads numbers, decimals and exponents", () => {
    const values = tokenize("12 3.5 .5 1e3").flatMap((token) =>
      token.type === "number" ? [token.value] : []
    );
    expect(values).toEqual([12, 3.5, 0.5, 1000]);
  });

  it("rejects an unknown character and an unterminated string", () => {
    expect(() => tokenize("1 # 2")).toThrow(FormulaError);
    expect(() => tokenize('"open')).toThrow(FormulaError);
    expect(() => tokenize("{fld")).toThrow(FormulaError);
  });
});

describe("parseFormula", () => {
  it("ranks operators like Teable: * before +, + before comparisons, & last", () => {
    expect(parseFormula("1 + 2 * 3")).toEqual({
      kind: "binary",
      operator: "+",
      left: { kind: "number", value: 1 },
      right: {
        kind: "binary",
        operator: "*",
        left: { kind: "number", value: 2 },
        right: { kind: "number", value: 3 },
      },
    });
    const concat = parseFormula('{a} = 1 & "x"');
    expect(concat).toMatchObject({ kind: "binary", operator: "&" });
    const compare = parseFormula("1 + 1 >= 2 = TRUE");
    expect(compare).toMatchObject({
      operator: "=",
      left: { operator: ">=" },
      right: { kind: "boolean", value: true },
    });
  });

  it("is left associative and gives unary minus the tightest binding", () => {
    expect(parseFormula("8 - 4 - 2")).toMatchObject({
      operator: "-",
      left: { operator: "-" },
      right: { value: 2 },
    });
    expect(parseFormula("-2 * 3")).toMatchObject({
      operator: "*",
      left: { kind: "negate", operand: { value: 2 } },
    });
  });

  it("reads calls case-insensitively, nested, with no argument", () => {
    expect(parseFormula("if(today(), Round({f}, 2), blank())")).toEqual({
      kind: "call",
      name: "IF",
      args: [
        { kind: "call", name: "TODAY", args: [] },
        {
          kind: "call",
          name: "ROUND",
          args: [
            { kind: "field", reference: "f" },
            { kind: "number", value: 2 },
          ],
        },
        { kind: "call", name: "BLANK", args: [] },
      ],
    });
  });

  it("accepts == and <> as = and !=", () => {
    expect(parseFormula("1 == 1")).toMatchObject({ operator: "=" });
    expect(parseFormula("1 <> 1")).toMatchObject({ operator: "!=" });
  });

  it("reports syntax errors", () => {
    expect(() => parseFormula("")).toThrow("empty");
    expect(() => parseFormula("IF(1, 2")).toThrow(FormulaError);
    expect(() => parseFormula("1 +")).toThrow(FormulaError);
    expect(() => parseFormula("1 2")).toThrow(FormulaError);
    expect(() => parseFormula("foo")).toThrow("Unknown name");
  });

  it("lists field references once each", () => {
    expect(
      fieldReferences(parseFormula("{a} + {b} * IF({a}, {c}, 1)"))
    ).toEqual(["a", "b", "c"]);
  });
});

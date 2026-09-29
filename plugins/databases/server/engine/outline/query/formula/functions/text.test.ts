import { DatabaseFieldType } from "@shared/databases/types";
import { evaluate, makeField } from "../../testFixtures";

const fields = [
  makeField({ id: "text", type: DatabaseFieldType.SingleLineText }),
  makeField({ id: "blank", type: DatabaseFieldType.SingleLineText }),
  makeField({ id: "num", type: DatabaseFieldType.Number }),
  makeField({ id: "tags", type: DatabaseFieldType.MultipleSelect }),
];
const cells = {
  text: "  Hello World  ",
  blank: null,
  num: 42,
  tags: ["a", "b"],
};
const run = (expression: string) =>
  evaluate(expression, { fields, cells }).value;

describe("text functions", () => {
  it("joins, measures and changes case", () => {
    expect(run('CONCATENATE("a", {num}, {blank}, {tags})')).toBe("a42a, b");
    expect(run("LEN(TRIM({text}))")).toBe(11);
    expect(run("LOWER(TRIM({text}))")).toBe("hello world");
    expect(run("UPPER({tags})")).toBe("A, B");
    expect(run('REPT("ab", 3)')).toBe("ababab");
    expect(run("LEN({blank})")).toBeNull();
  });

  it("finds text, FIND by case with 0 when absent, SEARCH without case", () => {
    expect(run('FIND("World", {text})')).toBe(9);
    expect(run('FIND("world", {text})')).toBe(0);
    expect(run('FIND("o", {text}, 8)')).toBe(10);
    expect(run('SEARCH("world", {text})')).toBe(9);
    expect(run('SEARCH("zzz", {text})')).toBeNull();
    expect(run('FIND("a", {blank})')).toBeNull();
    expect(run('FIND("z", "abc") > 0')).toBe(false);
  });

  it("cuts text by 1-based positions", () => {
    expect(run('MID("abcdef", 2, 3)')).toBe("bcd");
    expect(run('MID("abcdef", 0, 2)')).toBe("a");
    expect(run('LEFT("abcdef", 2)')).toBe("ab");
    expect(run('LEFT("abcdef")')).toBe("a");
    expect(run('RIGHT("abcdef", 2)')).toBe("ef");
    expect(run('REPLACE("abcdef", 2, 3, "X")')).toBe("aXef");
  });

  it("substitutes text and regular expressions", () => {
    expect(run('SUBSTITUTE("a-b-c", "-", "+")')).toBe("a+b+c");
    expect(run('SUBSTITUTE("a-b-c", "-", "+", 2)')).toBe("a-b+c");
    expect(
      run(
        'REGEXP_REPLACE("2025-03-18", "(\\\\d+)-(\\\\d+)-(\\\\d+)", "\\\\3/\\\\2/\\\\1")'
      )
    ).toBe("18/03/2025");
    expect(run('REGEXP_REPLACE("a1b22", "[0-9]+", "#")')).toBe("a#b#");
    expect(run('REGEXP_REPLACE("price", "i", "$")')).toBe("pr$ce");
    expect(() => run('REGEXP_REPLACE("a", "(", "")')).toThrow();
  });

  it("keeps text only with T and encodes URLs", () => {
    expect(run("T({text})")).toBe("  Hello World  ");
    expect(run("T({num})")).toBeNull();
    expect(run('ENCODE_URL_COMPONENT("a b&c")')).toBe("a%20b%26c");
  });
});

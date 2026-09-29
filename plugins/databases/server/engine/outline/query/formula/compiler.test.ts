import { DatabaseFieldType } from "@shared/databases/types";
import { PARIS, evaluate, makeField } from "../testFixtures";
import { FormulaError } from "./ast";

const fields = [
  makeField({ id: "num", type: DatabaseFieldType.Number }),
  makeField({ id: "blank", type: DatabaseFieldType.Number }),
  makeField({ id: "text", type: DatabaseFieldType.SingleLineText }),
  makeField({
    id: "date",
    type: DatabaseFieldType.Date,
    options: {
      formatting: { date: "D MMMM YYYY", time: "None", timeZone: PARIS },
    },
  }),
  makeField({ id: "check", type: DatabaseFieldType.Checkbox }),
  makeField({
    id: "tags",
    type: DatabaseFieldType.MultipleSelect,
    options: { choices: [{ name: "a", color: "red" }] },
  }),
  makeField({
    id: "people",
    type: DatabaseFieldType.User,
    options: { isMultiple: true },
  }),
  makeField({
    id: "links",
    type: DatabaseFieldType.Link,
    options: { foreignTableId: "tblOther" },
  }),
];

const cells = {
  num: 4,
  blank: null,
  text: "Design",
  date: "2025-03-18T23:00:00.000Z",
  check: true,
  tags: ["a", "b"],
  people: [{ id: "u1", title: "Ada" }],
  links: [
    { id: "rec1", title: "One" },
    { id: "rec2", title: "Two" },
  ],
};

const run = (expression: string) => evaluate(expression, { fields, cells });

describe("compileFormula: operators", () => {
  it("counts a blank as 0 in arithmetic and gives nothing on a division by zero", () => {
    expect(run("{num} * 2 + 1").value).toBe(9);
    expect(run("{blank} + 1").value).toBe(1);
    expect(run("{blank} / 7").value).toBe(0);
    expect(run("7 / {blank}").value).toBeNull();
    expect(run("7 / 0").value).toBeNull();
    expect(run("7 % 4").value).toBe(3);
    expect(run("-{num}").value).toBe(-4);
    expect(run("-{blank}").value).toBeNull();
  });

  it("adds numbers, joins anything else as text", () => {
    expect(run("{num} + 1")).toEqual({
      type: { type: "number", isMultiple: false },
      value: 5,
    });
    expect(run('{num} + "%"')).toEqual({
      type: { type: "string", isMultiple: false },
      value: "4%",
    });
    expect(run('{blank} + "%"').value).toBe("%");
    expect(run('{text} & " " & {num}').value).toBe("Design 4");
  });

  it("writes a date field in its own format when joined to text", () => {
    expect(run('"Le " & {date}').value).toBe("Le 19 mars 2025");
  });

  it("gives the days between two dates, on the wall clock", () => {
    expect(
      evaluate('DATETIME_PARSE("2025-05-16") - DATETIME_PARSE("2025-03-19")')
        .value
    ).toBe(58);
  });

  it("compares numbers with blanks worth 0, text exactly, dates as instants", () => {
    expect(run("{blank} >= 0").value).toBe(true);
    expect(run("{blank} > 0").value).toBe(false);
    expect(run("{blank} = 0").value).toBe(true);
    expect(run('{text} = "Design"').value).toBe(true);
    expect(run('{text} = "design"').value).toBe(false);
    expect(run('{text} != "Dev"').value).toBe(true);
    expect(run('{date} < DATETIME_PARSE("2025-03-20")').value).toBe(true);
    expect(run("{date} > TODAY()").value).toBe(false);
    expect(run('4 = "4"').value).toBe(true);
    expect(run('"abc" > "abd"').value).toBe(false);
  });

  it("never finds a blank date before or after anything", () => {
    const blankDate = makeField({ id: "none", type: DatabaseFieldType.Date });
    const result = evaluate("{none} < TODAY()", {
      fields: [blankDate],
      cells: {},
    });
    expect(result.value).toBe(false);
    expect(evaluate("{none} = BLANK()", { fields: [blankDate] }).value).toBe(
      true
    );
  });

  it("tests emptiness against BLANK()", () => {
    expect(run("{text} = BLANK()").value).toBe(false);
    expect(run("{blank} = BLANK()").value).toBe(true);
    expect(run("{blank} != BLANK()").value).toBe(false);
  });

  it("reads && and || as conditions", () => {
    expect(run("{check} && {num} > 3").value).toBe(true);
    expect(run("{blank} || 0").value).toBe(false);
  });
});

describe("compileFormula: fields", () => {
  it("reads people and linked rows by title, lists as lists", () => {
    expect(run("{links}")).toEqual({
      type: { type: "string", isMultiple: true },
      value: ["One", "Two"],
    });
    expect(run("{people}").value).toEqual(["Ada"]);
    expect(run('{tags} & ""').value).toBe("a, b");
  });

  it("types dates as dates and checkboxes as booleans", () => {
    expect(run("{date}").type).toEqual({ type: "dateTime", isMultiple: false });
    expect(run("{date}").value).toBe(Date.parse("2025-03-18T23:00:00.000Z"));
    expect(run("{check}").type).toEqual({ type: "boolean", isMultiple: false });
  });

  it("rejects unknown fields and functions, and wrong numbers of arguments", () => {
    expect(() => run("{nope}")).toThrow(FormulaError);
    expect(() => run("NOPE(1)")).toThrow("Unknown function NOPE");
    expect(() => run("ROUND()")).toThrow("at least 1");
    expect(() => run("NOT(1, 2)")).toThrow("at most 1");
  });
});

import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { choicesFor, convertCell } from "./convert";
import { PARIS, makeField } from "./testFixtures";

const field = (
  type: DatabaseFieldType,
  options: DatabaseField["options"] = {},
  extra: Partial<DatabaseField> = {}
): DatabaseField =>
  makeField({ id: `fld${type}`, name: type, type, options, ...extra });
const choices = (...names: string[]) => ({
  choices: names.map((name) => ({ name, color: "gray" })),
});

const text = field(DatabaseFieldType.SingleLineText);
const longText = field(DatabaseFieldType.LongText);
const number = field(DatabaseFieldType.Number, {
  formatting: { type: "decimal", precision: 2 },
});
const percent = field(DatabaseFieldType.Number, {
  formatting: { type: "percent", precision: 0 },
});
const checkbox = field(DatabaseFieldType.Checkbox);
const date = field(DatabaseFieldType.Date, {
  formatting: { date: "D MMMM YYYY", time: "None", timeZone: PARIS },
});
const multi = field(
  DatabaseFieldType.MultipleSelect,
  choices("a", "b", "a, b")
);
const single = field(DatabaseFieldType.SingleSelect, choices("a", "b", "3.50"));
const user = field(DatabaseFieldType.User, { isMultiple: true });
const link = field(DatabaseFieldType.Link, { foreignTableId: "tblX" });

describe("convertCell", () => {
  it("goes through the text the old field shows", () => {
    expect(convertCell(3.5, number, text)).toBe("3.50");
    expect(convertCell("2025-03-18T23:00:00.000Z", date, text)).toBe(
      "19 mars 2025"
    );
    expect(convertCell(true, checkbox, text)).toBe("true");
    expect(convertCell(["a", "b"], multi, text)).toBe("a, b");
    expect(convertCell("line\none", longText, text)).toBe("line one");
    expect(convertCell([{ id: "u1", title: "Ada" }], user, text)).toBe("Ada");
  });

  it("reads numbers, percentages, checkboxes and dates from text", () => {
    expect(convertCell("12,5 €", text, number)).toBe(125);
    expect(convertCell("50%", text, number)).toBe(0.5);
    expect(convertCell("abc", text, number)).toBeNull();
    expect(convertCell("45", text, percent)).toBe(0.45);
    expect(convertCell("yes", text, checkbox)).toBe(true);
    expect(convertCell("false", text, checkbox)).toBeNull();
    expect(convertCell(0, number, checkbox)).toBeNull();
    expect(convertCell("19 mars 2025", text, date)).toBe(
      "2025-03-18T23:00:00.000Z"
    );
    expect(convertCell("2025-03-19", text, date)).toBe(
      "2025-03-18T23:00:00.000Z"
    );
    expect(convertCell("someday", text, date)).toBeNull();
  });

  it("keeps a value both types hold as it is", () => {
    expect(convertCell(3.14159, number, percent)).toBe(3.14159);
    expect(convertCell("keep\nlines", text, longText)).toBe("keep\nlines");
  });

  it("maps to existing choices only", () => {
    expect(convertCell("a", text, single)).toBe("a");
    expect(convertCell("c", text, single)).toBeNull();
    expect(convertCell(3.5, number, single)).toBe("3.50");
    expect(convertCell(["b", "a"], multi, single)).toBe("b");
    expect(convertCell("a, b", text, multi)).toEqual(["a", "b"]);
    expect(convertCell("a, c", text, multi)).toEqual(["a"]);
    expect(convertCell("a", single, multi)).toEqual(["a"]);
    expect(convertCell(["a", "a, b"], multi, multi)).toEqual(["a", "a, b"]);
  });

  it("keeps people and links only between fields of the same kind", () => {
    const single = field(
      DatabaseFieldType.User,
      {},
      { isMultipleCellValue: false }
    );
    expect(convertCell([{ id: "u1", title: "Ada" }], user, single)).toEqual({
      id: "u1",
      title: "Ada",
    });
    expect(convertCell("Ada", text, user)).toBeNull();
    const sameTable = field(DatabaseFieldType.Link, { foreignTableId: "tblX" });
    expect(convertCell([{ id: "r1", title: "One" }], link, sameTable)).toEqual([
      { id: "r1" },
    ]);
    const otherTable = field(DatabaseFieldType.Link, {
      foreignTableId: "tblY",
    });
    expect(convertCell([{ id: "r1" }], link, otherTable)).toBeNull();
    expect(convertCell("x", text, field(DatabaseFieldType.Formula))).toBeNull();
    expect(convertCell(null, text, number)).toBeNull();
  });
});

describe("choicesFor", () => {
  it("suggests the text of each value, or of each element of a list, once", () => {
    expect(choicesFor(["b", "a", null, "b", "", "c, d"], text)).toEqual([
      "b",
      "a",
      "c, d",
    ]);
    expect(choicesFor([["x", "y"], ["y"]], multi)).toEqual(["x", "y"]);
    expect(choicesFor([3.5, 2], number)).toEqual(["3.50", "2.00"]);
    expect(choicesFor([[{ id: "u1", title: "Ada" }]], user)).toEqual(["Ada"]);
  });
});

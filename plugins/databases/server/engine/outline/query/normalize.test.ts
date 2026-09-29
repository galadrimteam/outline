import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { normalizeInput } from "./normalize";
import { PARIS, makeField } from "./testFixtures";

const field = (
  type: DatabaseFieldType,
  options: DatabaseField["options"] = {},
  extra: Partial<DatabaseField> = {}
): DatabaseField =>
  makeField({ id: `fld${type}`, name: "Champ", type, options, ...extra });

describe("normalizeInput", () => {
  it("trims text, on one line for a single line", () => {
    expect(
      normalizeInput("  a\nb  ", field(DatabaseFieldType.SingleLineText))
    ).toBe("a b");
    expect(normalizeInput("  a\nb  ", field(DatabaseFieldType.LongText))).toBe(
      "a\nb"
    );
    expect(normalizeInput(12, field(DatabaseFieldType.SingleLineText))).toBe(
      "12"
    );
    expect(
      normalizeInput("   ", field(DatabaseFieldType.SingleLineText))
    ).toBeNull();
  });

  it("reads numbers and ratings, refusing what is no number", () => {
    const number = field(DatabaseFieldType.Number);
    expect(normalizeInput(3, number)).toBe(3);
    expect(normalizeInput("1 234,5", number)).toBe(12345);
    expect(normalizeInput("-2.5", number)).toBe(-2.5);
    expect(() => normalizeInput("abc", number)).toThrow(
      "« abc » is not a number (Champ)."
    );
    expect(() => normalizeInput(true, number)).toThrow("not a number");
    const rating = field(DatabaseFieldType.Rating, { max: 5 });
    expect(normalizeInput(3.6, rating)).toBe(4);
    expect(normalizeInput("9", rating)).toBe(5);
    expect(normalizeInput(0, rating)).toBeNull();
  });

  it("makes checkboxes true or null", () => {
    const checkbox = field(DatabaseFieldType.Checkbox);
    expect(normalizeInput(true, checkbox)).toBe(true);
    expect(normalizeInput(false, checkbox)).toBeNull();
    expect(normalizeInput("true", checkbox)).toBe(true);
    expect(normalizeInput("false", checkbox)).toBeNull();
    expect(normalizeInput(1, checkbox)).toBe(true);
    expect(normalizeInput(0, checkbox)).toBeNull();
  });

  it("writes dates as ISO 8601, reading text in the field's format and zone", () => {
    const date = field(DatabaseFieldType.Date, {
      formatting: { date: "D/M/YYYY", time: "None", timeZone: PARIS },
    });
    expect(normalizeInput("2025-03-19T10:00:00+01:00", date)).toBe(
      "2025-03-19T09:00:00.000Z"
    );
    expect(normalizeInput("19/3/2025", date)).toBe("2025-03-18T23:00:00.000Z");
    expect(normalizeInput("1 juillet 2025", date)).toBe(
      "2025-06-30T22:00:00.000Z"
    );
    expect(normalizeInput(Date.UTC(2025, 0, 1), date)).toBe(
      "2025-01-01T00:00:00.000Z"
    );
    expect(() => normalizeInput("demain", date)).toThrow(
      "« demain » is not a date (Champ)."
    );
  });

  it("accepts select names that are choices only", () => {
    const choices = {
      choices: ["a", "b", "c, d"].map((name) => ({ name, color: "gray" })),
    };
    const single = field(DatabaseFieldType.SingleSelect, choices);
    expect(normalizeInput(" a ", single)).toBe("a");
    expect(normalizeInput(["b"], single)).toBe("b");
    expect(() => normalizeInput("z", single)).toThrow(
      "« z » is not an option of « Champ »."
    );
    expect(() => normalizeInput(["a", "b"], single)).toThrow("single value");
    const multi = field(DatabaseFieldType.MultipleSelect, choices);
    expect(normalizeInput(["a", "b", "a"], multi)).toEqual(["a", "b"]);
    expect(normalizeInput('a, "c, d"', multi)).toEqual(["a", "c, d"]);
    expect(() => normalizeInput(["a", "z"], multi)).toThrow("« z »");
  });

  it("writes people as {id, title}, one or a list", () => {
    const one = field(DatabaseFieldType.User);
    const many = field(DatabaseFieldType.User, { isMultiple: true });
    expect(
      normalizeInput({ id: "u1", title: "Ada", email: "ada@x.fr" }, one)
    ).toEqual({
      id: "u1",
      title: "Ada",
      email: "ada@x.fr",
    });
    expect(normalizeInput(["u1", "u2", "u1"], many)).toEqual([
      { id: "u1", title: "" },
      { id: "u2", title: "" },
    ]);
    expect(() => normalizeInput(["u1", "u2"], one)).toThrow("single person");
    expect(() => normalizeInput(3, one)).toThrow("not a person");
  });

  it("writes links as a list of ids", () => {
    const many = field(DatabaseFieldType.Link);
    const one = field(
      DatabaseFieldType.Link,
      { relationship: "manyOne" },
      { isMultipleCellValue: false }
    );
    expect(
      normalizeInput(
        [{ id: "r1", title: "x" }, { id: "r2" }, { id: "r1" }],
        many
      )
    ).toEqual([{ id: "r1" }, { id: "r2" }]);
    expect(normalizeInput(["r3", "r4"], many)).toEqual([
      { id: "r3" },
      { id: "r4" },
    ]);
    expect(normalizeInput({ id: "r1" }, one)).toEqual([{ id: "r1" }]);
    expect(() => normalizeInput(["r1", "r2"], one)).toThrow("single row");
  });

  it("keeps attachments and refuses computed fields", () => {
    const attachment = field(DatabaseFieldType.Attachment);
    const file = {
      id: "act1",
      name: "a.pdf",
      mimetype: "application/pdf",
      size: 3,
    };
    expect(normalizeInput([file], attachment)).toEqual([file]);
    expect(() => normalizeInput(["a.pdf"], attachment)).toThrow("not a file");
    expect(() => normalizeInput("x", field(DatabaseFieldType.Formula))).toThrow(
      "« Champ » is computed and cannot be written."
    );
    expect(() =>
      normalizeInput(1, field(DatabaseFieldType.AutoNumber))
    ).toThrow("computed");
    expect(normalizeInput(null, field(DatabaseFieldType.Number))).toBeNull();
    expect(
      normalizeInput([], field(DatabaseFieldType.MultipleSelect))
    ).toBeNull();
  });
});

import { DatabaseFieldType } from "@shared/databases/types";
import { evaluate, makeField } from "../../testFixtures";

const fields = [
  makeField({ id: "num", type: DatabaseFieldType.Number }),
  makeField({ id: "blank", type: DatabaseFieldType.Number }),
  makeField({ id: "text", type: DatabaseFieldType.SingleLineText }),
  makeField({ id: "check", type: DatabaseFieldType.Checkbox }),
  makeField({ id: "date", type: DatabaseFieldType.Date }),
  makeField({ id: "tags", type: DatabaseFieldType.MultipleSelect }),
  makeField({ id: "empty", type: DatabaseFieldType.MultipleSelect }),
];
const cells = {
  num: 0,
  blank: null,
  text: "x",
  check: true,
  date: "2025-03-18T23:00:00.000Z",
  tags: ["a"],
  empty: null,
};
const run = (expression: string) => evaluate(expression, { fields, cells });

describe("IF", () => {
  it("reads conditions like Teable: 0, blank, empty text and empty lists are false", () => {
    expect(run('IF({num}, "yes", "no")').value).toBe("no");
    expect(run('IF({blank}, "yes", "no")').value).toBe("no");
    expect(run('IF({text}, "yes", "no")').value).toBe("yes");
    expect(run('IF("", "yes", "no")').value).toBe("no");
    expect(run('IF({tags}, "yes", "no")').value).toBe("yes");
    expect(run('IF({empty}, "yes", "no")').value).toBe("no");
    expect(run('IF({date}, "yes", "no")').value).toBe("yes");
  });

  it("keeps a boolean IF boolean", () => {
    expect(run("IF({check}, TRUE, FALSE)")).toEqual({
      type: { type: "boolean", isMultiple: false },
      value: true,
    });
    expect(run("IF({num}, TRUE, BLANK())")).toEqual({
      type: { type: "boolean", isMultiple: false },
      value: null,
    });
  });

  it("takes the type of the other branch next to BLANK(), text when branches differ", () => {
    expect(run("IF({check}, 5, BLANK())")).toEqual({
      type: { type: "number", isMultiple: false },
      value: 5,
    });
    expect(run("IF(NOT({check}), {date}, BLANK())").type).toEqual({
      type: "dateTime",
      isMultiple: false,
    });
    expect(run('IF({check}, 3.5, "Soon")')).toEqual({
      type: { type: "string", isMultiple: false },
      value: "3.5",
    });
    expect(run("IF({check}, 1)").value).toBe(1);
    expect(run("IF({num}, 1)").value).toBeNull();
  });
});

describe("SWITCH", () => {
  it("returns the result of the first matching case, else the default", () => {
    expect(run('SWITCH({text}, "a", 1, "x", 2, 0)').value).toBe(2);
    expect(run('SWITCH({text}, "a", 1, 0)').value).toBe(0);
    expect(run('SWITCH({text}, "a", 1)').value).toBeNull();
    expect(run('SWITCH({num}, 0, "zero", "other")').value).toBe("zero");
  });
});

describe("AND, OR, XOR, NOT", () => {
  it("combines conditions, lists element by element", () => {
    expect(run("AND({check}, {text})").value).toBe(true);
    expect(run("AND({check}, {num})").value).toBe(false);
    expect(run("OR({num}, {blank}, {text})").value).toBe(true);
    expect(run("OR({num}, {blank})").value).toBe(false);
    expect(run("XOR({check}, {text})").value).toBe(false);
    expect(run("XOR({check}, {num})").value).toBe(true);
    expect(run("NOT({blank})").value).toBe(true);
    expect(run("NOT({empty})").value).toBe(true);
    expect(run("AND({tags})").value).toBe(true);
    expect(run("AND({empty})").value).toBe(false);
  });
});

describe("ERROR and IS_ERROR", () => {
  it("catches a failing value", () => {
    expect(run('IS_ERROR(ERROR("boom"))').value).toBe(true);
    expect(run("ISERROR(1)").value).toBe(false);
    expect(() => run('ERROR("boom")')).toThrow("boom");
  });
});

import { DatabaseFieldType } from "@shared/databases/types";
import {
  copyCells,
  parseTsv,
  pasteValue,
  planPaste,
  readCopiedCells,
  toTsv,
} from "./clipboard";
import { makeField } from "./testFixtures";

const title = makeField({ id: "name", isPrimary: true });
const status = makeField({
  id: "status",
  type: DatabaseFieldType.SingleSelect,
  options: { choices: [{ name: "À faire", color: "grayLight2" }] },
});
const tags = makeField({
  id: "tags",
  type: DatabaseFieldType.MultipleSelect,
  isMultipleCellValue: true,
  options: { choices: [{ name: "Front", color: "blue" }] },
});
const estimate = makeField({
  id: "estimate",
  type: DatabaseFieldType.Number,
  cellValueType: "number",
});
const done = makeField({ id: "done", type: DatabaseFieldType.Checkbox });
const due = makeField({
  id: "due",
  type: DatabaseFieldType.Date,
  cellValueType: "dateTime",
});
const owner = makeField({ id: "owner", type: DatabaseFieldType.User });
const epic = makeField({
  id: "epic",
  type: DatabaseFieldType.Link,
  options: { foreignTableId: "tblEpics" },
});
const formula = makeField({
  id: "formula",
  type: DatabaseFieldType.Formula,
  isComputed: true,
});

const noUser = () => undefined;

describe("toTsv and parseTsv", () => {
  it("round-trips cells holding tabs, line breaks and quotes", () => {
    const rows = [
      ["a", "b\tc"],
      ['say "hi"', "two\nlines"],
    ];
    expect(parseTsv(toTsv(rows))).toEqual(rows);
  });

  it("reads spreadsheet text with a trailing line break and CRLF", () => {
    expect(parseTsv("1\t2\r\n3\t4\r\n")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(parseTsv("")).toEqual([[""]]);
  });
});

describe("copyCells and readCopiedCells", () => {
  it("writes the shown text and the values behind it", () => {
    const { text, data } = copyCells(
      [[{ field: tags, value: ["Front", "Back"] }]],
      "fr-FR"
    );
    expect(text).toBe("Front, Back");
    expect(readCopiedCells(text, data)?.cells[0][0]).toMatchObject({
      type: DatabaseFieldType.MultipleSelect,
      value: ["Front", "Back"],
    });
  });

  it("ignores cells copied with another text", () => {
    const { data } = copyCells([[{ field: title, value: "A" }]]);
    expect(readCopiedCells("B", data)).toBeUndefined();
    expect(readCopiedCells("A", "not json")).toBeUndefined();
  });
});

describe("pasteValue", () => {
  it("reads numbers as typed, French comma included", () => {
    expect(pasteValue(estimate, "3,25", undefined, noUser)).toEqual({
      value: 3.25,
    });
    expect(pasteValue(estimate, "abc", undefined, noUser)).toBeUndefined();
  });

  it("clears a cell from an empty text", () => {
    expect(pasteValue(status, " ", undefined, noUser)).toEqual({
      value: null,
    });
  });

  it("names options, and lists the ones to create", () => {
    expect(pasteValue(status, "À faire", undefined, noUser)).toEqual({
      value: "À faire",
    });
    expect(pasteValue(tags, "Front, QA, qa", undefined, noUser)).toEqual({
      value: ["Front", "QA", "qa"],
      newChoices: ["QA", "qa"],
    });
  });

  it("reads checkboxes from their text", () => {
    expect(pasteValue(done, "✓", undefined, noUser)).toEqual({ value: true });
    expect(pasteValue(done, "maybe", undefined, noUser)).toBeUndefined();
  });

  it("keeps the exact value of a copied date, else leaves the text to the server", () => {
    const copied = {
      type: DatabaseFieldType.Date,
      isDate: true,
      value: "2026-09-10T22:00:00.000Z",
    };
    expect(pasteValue(due, "11 septembre 2026", copied, noUser)).toEqual({
      value: "2026-09-10T22:00:00.000Z",
    });
    expect(pasteValue(due, "2026-09-11", undefined, noUser)).toEqual({
      value: "2026-09-11",
    });
  });

  it("finds people by name, and refuses a name it does not know", () => {
    const findUser = (name: string) => (name === "PM" ? "user-pm" : undefined);
    expect(pasteValue(owner, "PM", undefined, findUser)).toEqual({
      value: [{ outlineUserId: "user-pm" }],
    });
    expect(
      pasteValue(owner, "PM, Nobody", undefined, findUser)
    ).toBeUndefined();
  });

  it("pastes relations only from a relation to the same table", () => {
    const copied = {
      type: DatabaseFieldType.Link,
      isDate: false,
      foreignTableId: "tblEpics",
      value: [{ id: "recEpic", title: "Auth" }],
    };
    expect(pasteValue(epic, "Auth", copied, noUser)).toEqual({
      value: [{ id: "recEpic" }],
    });
    expect(
      pasteValue(
        epic,
        "Auth",
        { ...copied, foreignTableId: "tblOther" },
        noUser
      )
    ).toBeUndefined();
    expect(pasteValue(epic, "Auth", undefined, noUser)).toBeUndefined();
  });
});

describe("planPaste", () => {
  const fields = [title, status, estimate, formula];
  const canWrite = (field: { isComputed: boolean }) => !field.isComputed;

  it("fills rows down and columns right from the cell, one update per row", () => {
    const plan = planPaste({
      texts: parseTsv("Terminé\t2\n\t3,5\nLost\t9"),
      rowIds: ["rec1", "rec2"],
      fields,
      start: { row: 0, col: 1 },
      canWrite,
      findUser: noUser,
    });
    expect(plan.updates).toEqual([
      { recordId: "rec1", values: { status: "Terminé", estimate: 2 } },
      { recordId: "rec2", values: { status: null, estimate: 3.5 } },
    ]);
    expect(plan.newChoices).toEqual({ status: ["Terminé"] });
  });

  it("skips computed cells and texts a field cannot take", () => {
    const plan = planPaste({
      texts: parseTsv("abc\t1"),
      rowIds: ["rec1"],
      fields,
      start: { row: 0, col: 2 },
      canWrite,
      findUser: noUser,
    });
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toBe(2);
  });
});

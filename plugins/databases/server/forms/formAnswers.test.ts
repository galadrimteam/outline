import type { DatabaseFormQuestion } from "@shared/databases/forms";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { formAnswers } from "./formAnswers";

function question(
  id: string,
  type: DatabaseFieldType,
  required = false,
  options: DatabaseField["options"] = {}
): DatabaseFormQuestion {
  return {
    required,
    field: {
      id,
      name: id,
      type,
      options,
      isPrimary: false,
      isComputed: false,
      isLookup: false,
      cellValueType: "string",
      isMultipleCellValue: false,
    },
  };
}

const questions = [
  question("fldName", DatabaseFieldType.SingleLineText, true),
  question("fldKind", DatabaseFieldType.SingleSelect, false, {
    choices: [
      { name: "Bug", color: "red" },
      { name: "Idée", color: "blue" },
    ],
  }),
  question("fldCount", DatabaseFieldType.Number),
  question("fldWhen", DatabaseFieldType.Date),
];

describe("formAnswers", () => {
  it("keeps valid answers and leaves empty ones out", () => {
    expect(
      formAnswers(questions, {
        fldName: "  The export is slow ",
        fldKind: "Bug",
        fldCount: "2,5",
        fldWhen: "",
      })
    ).toEqual({ fldName: "The export is slow", fldKind: "Bug", fldCount: 2.5 });
  });

  it("requires the required questions", () => {
    expect(() => formAnswers(questions, { fldKind: "Bug" })).toThrow(
      "« fldName » is required"
    );
  });

  it("refuses a choice that does not exist, and fields outside the form", () => {
    expect(() =>
      formAnswers(questions, { fldName: "x", fldKind: "Spam" })
    ).toThrow("« fldKind » is not valid");
    expect(() =>
      formAnswers(questions, { fldName: "x", fldSecret: "hidden" })
    ).toThrow("An answer does not belong to this form");
  });

  it("writes dates as ISO instants", () => {
    expect(
      formAnswers(questions, { fldName: "x", fldWhen: "2026-10-01" })
    ).toEqual({ fldName: "x", fldWhen: "2026-10-01T00:00:00.000Z" });
  });
});

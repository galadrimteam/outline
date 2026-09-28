import type { DatabaseFormDefinition } from "@shared/databases/forms";
import { DatabaseFieldType } from "@shared/databases/types";
import { makeField } from "~/components/Database/views/TableView/testFixtures";
import { isEmptyAnswer, missingAnswers, submission } from "./formModel";

const definition: DatabaseFormDefinition = {
  databaseId: "db1",
  viewId: "viwForm",
  title: "Maintenance",
  description: null,
  coverUrl: null,
  logoUrl: null,
  submitLabel: null,
  successMessage: null,
  requireLogin: false,
  canSubmit: true,
  questions: [
    { field: makeField({ id: "fldName" }), required: true },
    {
      field: makeField({ id: "fldKind", type: DatabaseFieldType.SingleSelect }),
      required: false,
    },
  ],
};

describe("form model", () => {
  it("treats blank text, empty lists and unchecked boxes as no answer", () => {
    expect(isEmptyAnswer("  ")).toBe(true);
    expect(isEmptyAnswer([])).toBe(true);
    expect(isEmptyAnswer(false)).toBe(true);
    expect(isEmptyAnswer(0)).toBe(false);
  });

  it("finds the required questions left unanswered", () => {
    expect(missingAnswers(definition.questions, { fldKind: "Bug" })).toEqual([
      "fldName",
    ]);
    expect(missingAnswers(definition.questions, { fldName: "Slow" })).toEqual(
      []
    );
  });

  it("sends the answers with the public address, and the honeypot only when filled", () => {
    expect(
      submission(definition, "abcdefgh", { fldName: "Slow", fldKind: null }, "")
    ).toEqual({ slug: "abcdefgh", fields: { fldName: "Slow" } });
    expect(
      submission(definition, undefined, { fldName: "Slow" }, "spam")
    ).toEqual({
      databaseId: "db1",
      viewId: "viwForm",
      fields: { fldName: "Slow" },
      website: "spam",
    });
  });
});

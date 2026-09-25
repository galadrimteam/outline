import type { TFunction } from "i18next";
import { DatabaseFieldType } from "@shared/databases/types";
import { makeField } from "../views/TableView/testFixtures";
import {
  actionSummary,
  defaultValueFor,
  draftProblem,
  emptyDraft,
  newAction,
  settableFields,
  triggerSummary,
  valueKindsFor,
} from "./automationText";

const t = ((key: string, options?: Record<string, string>) =>
  key.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_match, name: string) => options?.[name] ?? ""
  )) as unknown as TFunction;

const fields = [
  makeField({ id: "fldName", name: "Nom", isPrimary: true }),
  makeField({
    id: "fldStatus",
    name: "Statut",
    type: DatabaseFieldType.SingleSelect,
  }),
  makeField({ id: "fldDev", name: "Date Dev", type: DatabaseFieldType.Date }),
  makeField({ id: "fldWho", name: "Assigné", type: DatabaseFieldType.User }),
  makeField({
    id: "fldFormula",
    name: "Retard",
    type: DatabaseFieldType.Formula,
    isComputed: true,
  }),
  makeField({
    id: "fldParent",
    name: "Parent",
    type: DatabaseFieldType.Link,
    options: { foreignDatabaseId: "db1" },
  }),
];

describe("automation text", () => {
  it("describes triggers like Notion", () => {
    expect(triggerSummary({ type: "recordCreated" }, fields, t)).toEqual(
      "When a row is added"
    );
    expect(
      triggerSummary(
        { type: "propertyChanged", fieldId: "fldStatus", to: ["En Dev"] },
        fields,
        t
      )
    ).toEqual("When Statut is set to En Dev");
    expect(
      actionSummary(
        { type: "setProperty", fieldId: "fldDev", value: { kind: "now" } },
        fields,
        t
      )
    ).toEqual("Set Date Dev to today");
  });

  it("offers the values each field can take", () => {
    expect(settableFields(fields).map((field) => field.id)).toEqual([
      "fldName",
      "fldStatus",
      "fldDev",
      "fldWho",
      "fldParent",
    ]);
    expect(valueKindsFor(fields[2])[0]).toEqual("now");
    expect(valueKindsFor(fields[3])[0]).toEqual("me");
    expect(valueKindsFor(fields[5], "db1")).toEqual(["record", "clear"]);
    expect(valueKindsFor(fields[5], "db2")).toEqual(["clear"]);
    expect(defaultValueFor(fields[0])).toEqual({ kind: "template", text: "" });
  });

  it("presets a new « Edit property » on a date", () => {
    expect(newAction("setProperty", fields, "db1")).toEqual({
      type: "setProperty",
      fieldId: "fldDev",
      value: { kind: "now" },
    });
  });

  it("tells what keeps a draft from being saved", () => {
    const draft = emptyDraft();
    expect(draftProblem(draft, t)).toEqual("Add at least one action.");
    expect(
      draftProblem(
        {
          ...draft,
          actions: [
            { type: "slack", webhookUrl: "https://x.test", message: "" },
          ],
        },
        t
      )
    ).toEqual("Paste the address of a Slack incoming webhook.");
    expect(
      draftProblem(
        {
          ...draft,
          actions: [{ type: "notify", userIds: ["u1"], message: "" }],
        },
        t
      )
    ).toBeNull();
  });
});

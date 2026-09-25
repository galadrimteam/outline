import type { DatabaseEvent } from "@server/types";
import { createdRecordIds, triggeredRecordIds } from "./triggers";

function data(
  overrides: Partial<DatabaseEvent["data"]>
): DatabaseEvent["data"] {
  return { kinds: ["record.update"], recordIds: [], changes: [], ...overrides };
}

describe("triggeredRecordIds", () => {
  const statusTo = (to?: string[]) => ({
    type: "propertyChanged" as const,
    fieldId: "fldStatus",
    to,
  });

  it("fires on any change of the property", () => {
    const ids = triggeredRecordIds(
      statusTo(),
      data({
        changes: [
          { recordId: "rec1", fieldId: "fldStatus", before: "A", after: "B" },
          { recordId: "rec2", fieldId: "fldName", before: "x", after: "y" },
          { recordId: "rec3", fieldId: "fldStatus", before: "A", after: "A" },
        ],
      })
    );
    expect(ids).toEqual(["rec1"]);
  });

  it("fires when the property takes one of the values, case aside", () => {
    const ids = triggeredRecordIds(
      statusTo(["en développement"]),
      data({
        changes: [
          {
            recordId: "rec1",
            fieldId: "fldStatus",
            before: "À faire",
            after: "En Développement",
          },
          {
            recordId: "rec2",
            fieldId: "fldStatus",
            before: "À faire",
            after: "Terminé",
          },
        ],
      })
    );
    expect(ids).toEqual(["rec1"]);
  });

  it("fires when a multiple select gains the value, not when it keeps it", () => {
    const trigger = statusTo(["Urgent"]);
    expect(
      triggeredRecordIds(
        trigger,
        data({
          changes: [
            {
              recordId: "rec1",
              fieldId: "fldStatus",
              before: ["Bug"],
              after: ["Bug", "Urgent"],
            },
            {
              recordId: "rec2",
              fieldId: "fldStatus",
              before: ["Urgent"],
              after: ["Urgent", "Bug"],
            },
          ],
        })
      )
    ).toEqual(["rec1"]);
  });

  it("tells an unchecked checkbox apart", () => {
    const changes = [
      { recordId: "rec1", fieldId: "fldStatus", before: true, after: null },
      { recordId: "rec2", fieldId: "fldStatus", before: null, after: true },
    ];
    expect(triggeredRecordIds(statusTo(["false"]), data({ changes }))).toEqual([
      "rec1",
    ]);
    expect(triggeredRecordIds(statusTo(["true"]), data({ changes }))).toEqual([
      "rec2",
    ]);
  });

  it("never fires a button trigger on a change", () => {
    expect(
      triggeredRecordIds(
        { type: "buttonClicked", fieldId: "fldButton" },
        data({ kinds: ["record.create"], recordIds: ["rec1"] })
      )
    ).toEqual([]);
  });
});

describe("createdRecordIds", () => {
  it("takes every row of a batch of creations", () => {
    expect(
      createdRecordIds(
        data({ kinds: ["record.create"], recordIds: ["a", "b"] })
      )
    ).toEqual(["a", "b"]);
  });

  it("leaves out the rows updated in a mixed batch", () => {
    expect(
      createdRecordIds(
        data({
          kinds: ["record.create", "record.update"],
          recordIds: ["new", "old"],
          changes: [{ recordId: "old", fieldId: "f", before: 1, after: 2 }],
        })
      )
    ).toEqual(["new"]);
  });

  it("prefers the created rows the receiver tells apart", () => {
    expect(
      createdRecordIds({
        ...data({
          kinds: ["record.create", "record.update"],
          recordIds: ["a"],
        }),
        createdRecordIds: ["a"],
      })
    ).toEqual(["a"]);
  });

  it("finds nothing without a creation", () => {
    expect(createdRecordIds(data({ recordIds: ["a"] }))).toEqual([]);
  });
});

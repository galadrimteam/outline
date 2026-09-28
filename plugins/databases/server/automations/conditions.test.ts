import type {
  DatabaseField,
  DatabaseFilter,
  DatabaseFilterItem,
  DatabaseRecord,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { ConditionContext } from "./conditions";
import { matchesConditions } from "./conditions";

function field(
  id: string,
  type: DatabaseFieldType,
  cellValueType: DatabaseField["cellValueType"] = "string"
): DatabaseField {
  return {
    id,
    name: id,
    type,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType,
    isMultipleCellValue: false,
  };
}

const fields = [
  field("fldName", DatabaseFieldType.SingleLineText),
  field("fldStatus", DatabaseFieldType.SingleSelect),
  field("fldTags", DatabaseFieldType.MultipleSelect),
  field("fldCount", DatabaseFieldType.Number, "number"),
  field("fldDone", DatabaseFieldType.Checkbox, "boolean"),
  field("fldDue", DatabaseFieldType.Date, "dateTime"),
  field("fldOwner", DatabaseFieldType.User),
];

const context: ConditionContext = {
  fieldsById: new Map(fields.map((item) => [item.id, item])),
  actorEmail: "me@example.com",
  now: new Date("2026-09-25T10:00:00Z"),
};

const record: DatabaseRecord = {
  id: "rec1",
  fields: {
    fldName: "Fix the login page",
    fldStatus: "En cours",
    fldTags: ["Bug", "Front"],
    fldCount: 3,
    fldDone: true,
    fldDue: "2026-09-25T08:00:00.000Z",
    fldOwner: [{ id: "usr1", title: "Me", email: "me@example.com" }],
  },
};

function rule(
  fieldId: string,
  operator: DatabaseFilterItem["operator"],
  value: DatabaseFilterItem["value"]
): DatabaseFilter {
  return { conjunction: "and", filterSet: [{ fieldId, operator, value }] };
}

describe("matchesConditions", () => {
  it("matches text and selects without regard to case", () => {
    expect(
      matchesConditions(rule("fldStatus", "is", "en cours"), record, context)
    ).toBe(true);
    expect(
      matchesConditions(rule("fldName", "contains", "LOGIN"), record, context)
    ).toBe(true);
    expect(
      matchesConditions(
        rule("fldStatus", "isAnyOf", ["Terminé"]),
        record,
        context
      )
    ).toBe(false);
    expect(
      matchesConditions(
        rule("fldTags", "hasAllOf", ["Bug", "Front"]),
        record,
        context
      )
    ).toBe(true);
    expect(
      matchesConditions(rule("fldTags", "isExactly", ["Bug"]), record, context)
    ).toBe(false);
  });

  it("compares numbers and checkboxes", () => {
    expect(
      matchesConditions(rule("fldCount", "isGreater", 2), record, context)
    ).toBe(true);
    expect(
      matchesConditions(rule("fldCount", "isLessEqual", 2), record, context)
    ).toBe(false);
    expect(
      matchesConditions(rule("fldDone", "is", true), record, context)
    ).toBe(true);
    expect(
      matchesConditions(rule("fldDone", "is", false), record, context)
    ).toBe(false);
  });

  it("reads « Me » as the person who triggered the automation", () => {
    expect(
      matchesConditions(rule("fldOwner", "hasAnyOf", ["Me"]), record, context)
    ).toBe(true);
    expect(
      matchesConditions(rule("fldOwner", "hasAnyOf", ["Me"]), record, {
        ...context,
        actorEmail: "someone@example.com",
      })
    ).toBe(false);
    expect(
      matchesConditions(
        rule("fldOwner", "isExactly", ["usr1"]),
        record,
        context
      )
    ).toBe(true);
  });

  it("reads relative dates in the filter's time zone", () => {
    const today = { mode: "today" as const, timeZone: "Europe/Paris" };
    expect(
      matchesConditions(rule("fldDue", "is", today), record, context)
    ).toBe(true);
    expect(
      matchesConditions(
        rule("fldDue", "isBefore", {
          mode: "tomorrow",
          timeZone: "Europe/Paris",
        }),
        record,
        context
      )
    ).toBe(true);
    expect(
      matchesConditions(
        rule("fldDue", "isWithIn", { mode: "pastWeek", timeZone: "UTC" }),
        record,
        context
      )
    ).toBe(true);
    expect(
      matchesConditions(
        rule("fldDue", "isAfter", {
          mode: "exactDate",
          exactDate: "2026-09-25T00:00:00.000Z",
          timeZone: "UTC",
        }),
        record,
        context
      )
    ).toBe(false);
  });

  it("combines rules and groups", () => {
    const filter: DatabaseFilter = {
      conjunction: "or",
      filterSet: [
        { fieldId: "fldStatus", operator: "is", value: "Terminé" },
        {
          conjunction: "and",
          filterSet: [
            { fieldId: "fldDone", operator: "is", value: true },
            { fieldId: "fldCount", operator: "isNotEmpty", value: null },
          ],
        },
      ],
    };
    expect(matchesConditions(filter, record, context)).toBe(true);
    expect(
      matchesConditions({ ...filter, conjunction: "and" }, record, context)
    ).toBe(false);
  });

  it("does not match a rule on a deleted field", () => {
    expect(
      matchesConditions(rule("fldGone", "isEmpty", null), record, context)
    ).toBe(false);
  });
});

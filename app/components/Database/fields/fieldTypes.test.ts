import type { TFunction } from "i18next";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import { makeField } from "../views/TableView/testFixtures";
import {
  FIELD_KINDS,
  fieldKindLabel,
  fieldKindOf,
  fieldKindSetup,
  isLossyConversion,
  uniqueFieldName,
} from "./fieldTypes";

const t = ((key: string) => key) as unknown as TFunction;

describe("fieldKindOf", () => {
  it("tells text shown as links apart", () => {
    expect(fieldKindOf(makeField())).toBe("text");
    expect(
      fieldKindOf(makeField({ options: { showAs: { type: "email" } } }))
    ).toBe("email");
  });

  it("tells statuses apart from selects", () => {
    const select = makeField({ type: DatabaseFieldType.SingleSelect });
    expect(fieldKindOf(select)).toBe("select");
    expect(
      fieldKindOf({
        ...select,
        meta: { statusGroups: { A: DatabaseStatusGroup.ToDo } },
      })
    ).toBe("status");
  });

  it("has no kind for relations and formulas", () => {
    expect(
      fieldKindOf(makeField({ type: DatabaseFieldType.Link }))
    ).toBeUndefined();
  });
});

describe("fieldKindLabel", () => {
  it("names every kind", () => {
    for (const kind of FIELD_KINDS) {
      expect(fieldKindLabel(kind.id, t)).toBeTruthy();
    }
  });
});

describe("fieldKindSetup", () => {
  it("creates statuses with three groups", () => {
    const setup = fieldKindSetup("status", t);
    expect(setup.type).toBe(DatabaseFieldType.SingleSelect);
    expect(setup.options.choices).toHaveLength(3);
    expect(Object.values(setup.meta?.statusGroups ?? {})).toEqual([
      DatabaseStatusGroup.ToDo,
      DatabaseStatusGroup.InProgress,
      DatabaseStatusGroup.Complete,
    ]);
  });

  it("keeps options when switching between select kinds", () => {
    const current = makeField({
      type: DatabaseFieldType.SingleSelect,
      options: { choices: [{ name: "A", color: "red" }] },
    });
    expect(fieldKindSetup("multiSelect", t, current).options.choices).toEqual([
      { name: "A", color: "red" },
    ]);
  });

  it("shows URLs as links", () => {
    expect(fieldKindSetup("url", t).options.showAs).toEqual({ type: "url" });
  });
});

describe("isLossyConversion", () => {
  const text = makeField();
  const select = makeField({ type: DatabaseFieldType.SingleSelect });
  const files = makeField({ type: DatabaseFieldType.Attachment });
  const date = makeField({ type: DatabaseFieldType.Date });

  it("does not ask for safe conversions", () => {
    expect(isLossyConversion(text, "select")).toBe(false);
    expect(isLossyConversion(select, "multiSelect")).toBe(false);
    expect(isLossyConversion(select, "text")).toBe(false);
    expect(isLossyConversion(date, "text")).toBe(false);
  });

  it("asks when values may be lost", () => {
    expect(isLossyConversion(files, "text")).toBe(true);
    expect(isLossyConversion(text, "number")).toBe(true);
    expect(isLossyConversion(date, "checkbox")).toBe(true);
    expect(
      isLossyConversion(
        makeField({ type: DatabaseFieldType.Formula, isComputed: true }),
        "text"
      )
    ).toBe(true);
  });
});

describe("uniqueFieldName", () => {
  it("numbers taken names", () => {
    const fields = [{ name: "Property" }, { name: "Property (1)" }];
    expect(uniqueFieldName(fields, "Other")).toBe("Other");
    expect(uniqueFieldName(fields, "property")).toBe("property (2)");
  });
});

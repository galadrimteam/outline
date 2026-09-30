import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import type { DatabaseField, DatabaseView } from "@shared/databases/types";
import { DatabaseSettingsHelper } from "./DatabaseSettingsHelper";

const view = (id: string): DatabaseView => ({
  id,
  name: id,
  type: "grid",
  layout: DatabaseLayout.Table,
  order: 0,
  filter: null,
  sort: null,
  group: null,
  columnMeta: {},
  options: {},
  overrides: {},
  isLocked: false,
});

const field = (id: string): DatabaseField => ({
  id,
  name: id,
  type: DatabaseFieldType.Formula,
  options: {},
  isPrimary: false,
  isComputed: true,
  isLookup: false,
  cellValueType: "dateTime",
  isMultipleCellValue: false,
});

describe("DatabaseSettingsHelper", () => {
  it("applies overrides and field metadata to a schema", () => {
    const schema = DatabaseSettingsHelper.applyToSchema(
      { fields: [field("fldA")], views: [view("viwA"), view("viwB")] },
      {
        viewOverrides: { viwA: { layout: DatabaseLayout.Timeline } },
        fieldMeta: { fldA: { endFieldId: "fldB" } },
      }
    );

    expect(schema.views[0].layout).toEqual(DatabaseLayout.Timeline);
    expect(schema.views[0].overrides).toEqual({
      layout: DatabaseLayout.Timeline,
    });
    expect(schema.views[1].layout).toEqual(DatabaseLayout.Table);
    expect(schema.fields[0].meta).toEqual({ endFieldId: "fldB" });
    expect(schema.fields[0].cellValueType).toEqual("dateTime");
  });

  it("merges entries one by one, null removing one", () => {
    const settings = DatabaseSettingsHelper.merge(
      {
        viewOverrides: {
          viwA: { cardSize: "small" },
          viwB: { cardSize: "large" },
        },
        fieldMeta: { fldA: { endFieldId: "fldB" } },
        iconFieldId: "fldIcon",
        subItemFieldId: "fldSub",
      },
      {
        viewOverrides: { viwA: { openPagesIn: "fullPage" }, viwB: null },
        iconFieldId: null,
      }
    );

    expect(settings).toEqual({
      viewOverrides: { viwA: { openPagesIn: "fullPage" } },
      fieldMeta: { fldA: { endFieldId: "fldB" } },
      subItemFieldId: "fldSub",
    });
    expect(
      DatabaseSettingsHelper.merge(settings, { subItemFieldId: null })
    ).not.toHaveProperty("subItemFieldId");
  });

  it("merges a view's overrides key by key", () => {
    const settings = DatabaseSettingsHelper.mergeViewOverrides(
      { viewOverrides: { viwA: { cardSize: "small", hiddenStacks: [""] } } },
      "viwA",
      { hiddenStacks: null, stackOrder: ["Done", "To do"], subItems: "off" }
    );

    expect(settings.viewOverrides).toEqual({
      viwA: {
        cardSize: "small",
        stackOrder: ["Done", "To do"],
        subItems: "off",
      },
    });

    const emptied = DatabaseSettingsHelper.mergeViewOverrides(
      settings,
      "viwA",
      { cardSize: null, stackOrder: null, subItems: null }
    );
    expect(emptied.viewOverrides).toEqual({});
  });

  it("gives the engine the order and the folded groups of a view", () => {
    const settings = {
      viewOverrides: {
        viwA: { stackOrder: ["S1", ""], hiddenStacks: [""] },
        viwB: { cardSize: "small" as const },
      },
    };
    expect(DatabaseSettingsHelper.groupLayout(settings, "viwA")).toEqual({
      order: ["S1", ""],
      hidden: [""],
    });
    expect(DatabaseSettingsHelper.groupLayout(settings, "viwB")).toBe(
      undefined
    );
    expect(DatabaseSettingsHelper.groupLayout(settings, undefined)).toBe(
      undefined
    );
  });

  it("forgets a deleted field", () => {
    const settings = DatabaseSettingsHelper.withoutField(
      {
        fieldMeta: { fldA: {}, fldB: {} },
        iconFieldId: "fldA",
        subItemFieldId: "fldA",
        pageLayout: { hiddenFieldIds: ["fldA", "fldB"], hideEmpty: true },
      },
      "fldA"
    );

    expect(settings.fieldMeta).toEqual({ fldB: {} });
    expect(settings.iconFieldId).toBeUndefined();
    expect(settings.subItemFieldId).toBeUndefined();
    expect(settings.pageLayout?.hiddenFieldIds).toEqual(["fldB"]);
    expect(settings.pageLayout?.hideEmpty).toBe(true);
  });
});

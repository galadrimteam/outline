import type { DatabaseSettings } from "@shared/databases/types";
import { DatabaseLayout, DatabaseStatusGroup } from "@shared/databases/types";
import { remapEngineIds } from "./remapEngineIds";

describe("remapEngineIds", () => {
  it("replaces the ids of views and fields in keys and values", () => {
    const settings: DatabaseSettings = {
      viewOverrides: {
        viwAAAAAAAAAAAAAAAA: {
          layout: DatabaseLayout.Timeline,
          subGroupFieldId: "fldBBBBBBBBBBBBBBBB",
          stackOrder: ["À faire", ""],
          timeline: { startFieldId: "fldCCCCCCCCCCCCCCCC", zoom: "month" },
        },
      },
      fieldMeta: {
        fldCCCCCCCCCCCCCCCC: {
          statusGroups: { Terminé: DatabaseStatusGroup.Complete },
          endFieldId: "fldDDDDDDDDDDDDDDDD",
        },
      },
      pageLayout: { hiddenFieldIds: ["fldBBBBBBBBBBBBBBBB"], hideEmpty: true },
      iconFieldId: "fldEEEEEEEEEEEEEEEE",
    };

    const remapped = remapEngineIds(settings, {
      viwAAAAAAAAAAAAAAAA: "viwaaaaaaaaaaaaaaaa",
      fldBBBBBBBBBBBBBBBB: "fldbbbbbbbbbbbbbbbb",
      fldCCCCCCCCCCCCCCCC: "fldcccccccccccccccc",
      fldDDDDDDDDDDDDDDDD: "flddddddddddddddddd",
    });

    expect(remapped).toEqual({
      viewOverrides: {
        viwaaaaaaaaaaaaaaaa: {
          layout: DatabaseLayout.Timeline,
          subGroupFieldId: "fldbbbbbbbbbbbbbbbb",
          stackOrder: ["À faire", ""],
          timeline: { startFieldId: "fldcccccccccccccccc", zoom: "month" },
        },
      },
      fieldMeta: {
        fldcccccccccccccccc: {
          statusGroups: { Terminé: DatabaseStatusGroup.Complete },
          endFieldId: "flddddddddddddddddd",
        },
      },
      pageLayout: { hiddenFieldIds: ["fldbbbbbbbbbbbbbbbb"], hideEmpty: true },
      iconFieldId: "fldEEEEEEEEEEEEEEEE",
    });
    expect(settings.iconFieldId).toEqual("fldEEEEEEEEEEEEEEEE");
  });

  it("leaves empty values alone", () => {
    expect(remapEngineIds(null, { a: "b" })).toBeNull();
    expect(remapEngineIds(undefined, { a: "b" })).toBeUndefined();
  });
});

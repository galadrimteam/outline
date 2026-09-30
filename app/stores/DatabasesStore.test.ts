import type { DatabaseView } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { mergeViewPatch } from "./DatabasesStore";

const view: DatabaseView = {
  id: "viw1",
  name: "Roadmap",
  type: "grid",
  layout: DatabaseLayout.Table,
  order: 0,
  filter: null,
  sort: null,
  group: null,
  columnMeta: {},
  options: {},
  overrides: { icon: "map", cardSize: "small" },
  isLocked: false,
};

describe("mergeViewPatch", () => {
  it("changes overrides key by key", () => {
    expect(
      mergeViewPatch(view, { overrides: { icon: "🗺️" } }).overrides
    ).toEqual({ icon: "🗺️", cardSize: "small" });
  });

  it("removes an override set to null", () => {
    expect(
      mergeViewPatch(view, { overrides: { icon: null } }).overrides
    ).toEqual({ cardSize: "small" });
  });
});

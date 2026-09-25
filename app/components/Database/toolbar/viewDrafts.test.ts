import type { DatabaseField, DatabaseView } from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import {
  canSaveView,
  draftFilter,
  isFilterDirty,
  isSortDirty,
  sortsEqual,
  viewDrafts,
  viewQueryParams,
} from "./viewDrafts";

const status: DatabaseField = {
  id: "status",
  name: "Status",
  type: DatabaseFieldType.SingleSelect,
  options: {},
  isPrimary: false,
  isComputed: false,
  isLookup: false,
  cellValueType: "string",
  isMultipleCellValue: false,
};

const database = {
  id: "db",
  fieldById: (id: string) => (id === "status" ? status : undefined),
};

const view: DatabaseView = {
  id: "v",
  name: "Kanban",
  type: "kanban",
  layout: DatabaseLayout.Board,
  order: 0,
  filter: {
    conjunction: "and",
    filterSet: [{ fieldId: "status", operator: "isNot", value: "Done" }],
  },
  sort: null,
  group: null,
  columnMeta: {},
  options: {},
  overrides: {},
  isLocked: false,
};

describe("viewDrafts", () => {
  afterEach(() => viewDrafts.reset("db", "v"));

  it("sends nothing while the view is shown as saved", () => {
    expect(viewQueryParams(database, view, false)).toEqual({});
    viewDrafts.set("db", "v", { filter: view.filter });
    expect(viewQueryParams(database, view, false)).toEqual({});
    expect(isFilterDirty(view, viewDrafts.get("db", "v"), true)).toBe(false);
  });

  it("sends the edited filter without its incomplete rules", () => {
    viewDrafts.set("db", "v", {
      filter: {
        conjunction: "and",
        filterSet: [
          { fieldId: "status", operator: "is", value: "Doing" },
          { fieldId: "status", operator: "is", value: null },
        ],
      },
    });
    expect(viewQueryParams(database, view, false)).toEqual({
      filter: {
        conjunction: "and",
        filterSet: [{ fieldId: "status", operator: "is", value: "Doing" }],
      },
      replaceFilter: true,
    });
  });

  it("keeps a reader's rules apart from the view's", () => {
    const extra = {
      conjunction: "and" as const,
      filterSet: [
        { fieldId: "status", operator: "is" as const, value: "Doing" },
      ],
    };
    viewDrafts.set("db", "v", { extraFilter: extra });
    const draft = viewDrafts.get("db", "v");
    expect(draftFilter(view, draft, false)).toEqual(extra);
    expect(draftFilter(view, draft, true)).toEqual(view.filter);
    expect(viewQueryParams(database, view, true)).toEqual({ filter: extra });
  });

  it("replaces the sort, an emptied sort included", () => {
    const sorted = {
      ...view,
      sort: { sortObjs: [{ fieldId: "status", order: "asc" as const }] },
    };
    viewDrafts.set("db", "v", { sort: null });
    expect(isSortDirty(sorted, viewDrafts.get("db", "v"))).toBe(true);
    expect(viewQueryParams(database, sorted, false)).toEqual({
      sort: { sortObjs: [] },
    });
    expect(sortsEqual(null, { sortObjs: [] })).toBe(true);
  });

  it("only lets editors save an unlocked view", () => {
    expect(canSaveView(view, false)).toBe(true);
    expect(canSaveView(view, true)).toBe(false);
    expect(canSaveView({ ...view, isLocked: true }, false)).toBe(false);
  });
});

import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { makeField, makeView } from "../views/TableView/testFixtures";
import {
  pageDiscussions,
  pageFields,
  propertyVisibility,
  splitPageProperties,
  withPropertyVisibility,
} from "./pageLayout";

const title = makeField({ id: "title", isPrimary: true });
const icon = makeField({ id: "icon" });
const status = makeField({
  id: "status",
  type: DatabaseFieldType.SingleSelect,
});
const notes = makeField({ id: "notes", type: DatabaseFieldType.LongText });
const fields = [title, icon, status, notes];

describe("pageFields", () => {
  it("follows the first table and leaves out the title and the icon", () => {
    const board = makeView({
      id: "board",
      layout: DatabaseLayout.Board,
      type: "kanban",
      order: 0,
      columnMeta: { status: { order: 0 }, notes: { order: 1 } },
    });
    const table = makeView({
      id: "table",
      order: 1,
      columnMeta: { notes: { order: 0 }, status: { order: 1 } },
    });
    expect(
      pageFields(fields, [board, table], "icon").map((field) => field.id)
    ).toEqual(["notes", "status"]);
  });

  it("follows the page order of the layout, then the table for the others", () => {
    const priority = makeField({ id: "priority" });
    const table = makeView({
      id: "table",
      columnMeta: {
        notes: { order: 0 },
        priority: { order: 1 },
        status: { order: 2 },
      },
    });
    expect(
      pageFields([title, icon, status, notes, priority], [table], "icon", {
        fieldOrder: ["status", "notes"],
      }).map((field) => field.id)
    ).toEqual(["status", "notes", "priority"]);
  });

  it("leaves out the columns the layout omits, hidden ones too", () => {
    const notion = makeField({ id: "notion" });
    expect(
      pageFields([title, status, notes, notion], [], undefined, {
        hiddenFieldIds: ["notes", "notion"],
        omittedFieldIds: ["notion"],
      }).map((field) => field.id)
    ).toEqual(["status", "notes"]);
  });

  it("shows a date range as one property, its start", () => {
    const start = makeField({
      id: "start",
      type: DatabaseFieldType.Date,
      meta: { endFieldId: "end" },
    });
    const end = makeField({ id: "end", type: DatabaseFieldType.Date });
    expect(
      pageFields([title, start, end, notes], []).map((field) => field.id)
    ).toEqual(["start", "notes"]);
  });
});

describe("visibility", () => {
  it("reads and writes the page layout", () => {
    const layout = withPropertyVisibility(undefined, "status", "hidden");
    expect(propertyVisibility(layout, "status")).toBe("hidden");
    const next = withPropertyVisibility(layout, "status", "hideWhenEmpty");
    expect(next.hiddenFieldIds).toEqual([]);
    expect(propertyVisibility(next, "status")).toBe("hideWhenEmpty");
    expect(propertyVisibility(next, "notes")).toBe("always");
  });
});

describe("splitPageProperties", () => {
  const record = { id: "rec", fields: { status: "A", notes: null } };

  it("hides hidden properties and empty ones when asked", () => {
    expect(
      splitPageProperties([status, notes], record, {
        hideWhenEmptyFieldIds: ["notes"],
      }).hidden.map((field) => field.id)
    ).toEqual(["notes"]);
    expect(
      splitPageProperties([status, notes], record, {
        hiddenFieldIds: ["status"],
      }).shown.map((field) => field.id)
    ).toEqual(["notes"]);
    expect(
      splitPageProperties([status, notes], record, {
        hideEmpty: true,
      }).shown.map((field) => field.id)
    ).toEqual(["status"]);
  });

  it("shows everything by default", () => {
    const split = splitPageProperties([status, notes], record, undefined);
    expect(split.hidden).toEqual([]);
    expect(split.pinned).toBe(false);
  });

  it("shows only the pinned properties, in their order, the others behind details", () => {
    const priority = makeField({ id: "priority" });
    const split = splitPageProperties([status, notes, priority], record, {
      pinnedFieldIds: ["priority", "gone", "status"],
      hideEmpty: true,
    });
    expect(split.pinned).toBe(true);
    expect(split.shown.map((field) => field.id)).toEqual([
      "priority",
      "status",
    ]);
    expect(split.hidden.map((field) => field.id)).toEqual(["notes"]);
  });

  it("folds every property behind details when the layout pins none", () => {
    const split = splitPageProperties([status, notes], record, {
      pinnedFieldIds: [],
    });
    expect(split.pinned).toBe(true);
    expect(split.shown).toEqual([]);
    expect(split.hidden.map((field) => field.id)).toEqual(["status", "notes"]);
  });
});

describe("pageDiscussions", () => {
  it("keeps the discussions of a page minimal unless its database says otherwise, as Notion", () => {
    expect(pageDiscussions(undefined)).toBe("minimal");
    expect(pageDiscussions({})).toBe("minimal");
    expect(pageDiscussions({ discussions: "expanded" })).toBe("expanded");
    expect(pageDiscussions({ discussions: "off" })).toBe("off");
  });
});

import { DatabaseFieldType } from "@shared/databases/types";
import {
  GUTTER_WIDTH,
  clampColumnWidth,
  defaultColumnWidth,
  frozenEdge,
  insertionOrder,
  moveId,
  rowLayout,
  tableColumns,
} from "./layout";
import { makeField, makeView } from "./testFixtures";

const title = makeField({ id: "title", isPrimary: true });
const status = makeField({
  id: "status",
  type: DatabaseFieldType.SingleSelect,
});
const done = makeField({ id: "done", type: DatabaseFieldType.Checkbox });
const notes = makeField({ id: "notes", type: DatabaseFieldType.LongText });
const fields = [title, status, done, notes];

describe("tableColumns", () => {
  it("orders visible columns by the view, the title first", () => {
    const view = makeView({
      columnMeta: {
        title: { order: 3 },
        status: { order: 2, width: 150 },
        done: { order: 0 },
        notes: { order: 1, hidden: true },
      },
    });
    const columns = tableColumns(fields, view);
    expect(columns.map((column) => column.field.id)).toEqual([
      "title",
      "done",
      "status",
    ]);
    expect(columns[2].width).toBe(150);
  });

  it("freezes columns up to the frozen field, else the first one", () => {
    const view = makeView({
      columnMeta: {
        title: { order: 0 },
        status: { order: 1 },
        done: { order: 2 },
      },
    });
    expect(tableColumns(fields, view).map((c) => c.frozen)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    const frozen = tableColumns(fields, {
      ...view,
      options: { frozenFieldId: "status" },
    });
    expect(frozen.map((c) => c.frozen)).toEqual([true, true, false, false]);
    expect(frozen[1].left).toBe(GUTTER_WIDTH + frozen[0].width);
  });

  it("lets widths being resized win", () => {
    const columns = tableColumns(fields, makeView(), { status: 321 });
    expect(columns.find((c) => c.field.id === "status")?.width).toBe(321);
  });
});

describe("widths", () => {
  it("starts titles wide and checkboxes narrow", () => {
    expect(defaultColumnWidth(title)).toBeGreaterThan(
      defaultColumnWidth(status)
    );
    expect(defaultColumnWidth(done)).toBeLessThan(defaultColumnWidth(status));
  });

  it("clamps resized widths", () => {
    expect(clampColumnWidth(10)).toBe(64);
    expect(clampColumnWidth(5000)).toBe(1200);
    expect(clampColumnWidth(200.4)).toBe(200);
  });
});

describe("rowLayout", () => {
  it("wraps taller rows and fits content on autoFit", () => {
    expect(rowLayout(undefined)).toEqual({
      height: 36,
      wrap: false,
      autoFit: false,
    });
    expect(rowLayout("tall").wrap).toBe(true);
    expect(rowLayout("autoFit").autoFit).toBe(true);
  });
});

describe("moveId", () => {
  it("moves an id to the place of another", () => {
    expect(moveId(["a", "b", "c", "d"], "a", "c")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(moveId(["a", "b", "c", "d"], "d", "b")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    const ids = ["a", "b"];
    expect(moveId(ids, "a", "x")).toBe(ids);
  });
});

describe("insertionOrder", () => {
  const view = makeView({
    columnMeta: {
      title: { order: 0 },
      status: { order: 1 },
      done: { order: 2 },
    },
  });

  it("places a column between its neighbours", () => {
    expect(insertionOrder(fields, view, "status", "right")).toBe(1.5);
    expect(insertionOrder(fields, view, "status", "left")).toBe(0.5);
  });

  it("places a column past the edges", () => {
    expect(insertionOrder(fields, view, "title", "left")).toBe(-1);
    expect(insertionOrder(fields.slice(0, 3), view, "done", "right")).toBe(3);
  });
});

describe("frozenEdge", () => {
  it("ends after the last frozen column", () => {
    const view = makeView({ options: { frozenFieldId: "status" } });
    const columns = tableColumns(fields, view);
    expect(frozenEdge(columns)).toBe(GUTTER_WIDTH + 280 + 200);
  });

  it("is the gutter alone without columns", () => {
    expect(frozenEdge([])).toBe(GUTTER_WIDTH);
  });
});

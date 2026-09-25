import type { DatabaseView } from "@shared/databases/types";
import {
  cardFields,
  isFieldVisible,
  orderedFields,
  orderPatch,
  visibilityPatch,
} from "./columns";

const fields = [
  { id: "a", isPrimary: false },
  { id: "title", isPrimary: true },
  { id: "b", isPrimary: false },
  { id: "c", isPrimary: false },
];

const grid: Pick<DatabaseView, "type" | "columnMeta"> = {
  type: "grid",
  columnMeta: {
    a: { order: 2 },
    b: { order: 1, hidden: true },
    title: { order: 0 },
  },
};

const kanban: Pick<DatabaseView, "type" | "columnMeta"> = {
  type: "kanban",
  columnMeta: { a: { order: 1, visible: true }, c: { order: 0 } },
};

describe("columns", () => {
  it("orders by column meta, the primary field first", () => {
    expect(orderedFields(fields, grid).map((f) => f.id)).toEqual([
      "title",
      "b",
      "a",
      "c",
    ]);
  });

  it("hides with the flag of the view type", () => {
    expect(isFieldVisible(grid, fields[2])).toBe(false);
    expect(isFieldVisible(grid, fields[3])).toBe(true);
    expect(isFieldVisible(kanban, fields[0])).toBe(true);
    expect(isFieldVisible(kanban, fields[3])).toBe(false);
    expect(isFieldVisible(kanban, fields[1])).toBe(true);
  });

  it("lists card properties without the title", () => {
    expect(cardFields(fields, grid).map((f) => f.id)).toEqual(["a", "c"]);
    expect(cardFields(fields, kanban).map((f) => f.id)).toEqual(["a"]);
  });

  it("builds visibility and order patches", () => {
    expect(visibilityPatch(grid, false)).toEqual({ hidden: true });
    expect(visibilityPatch(kanban, true)).toEqual({ visible: true });
    expect(orderPatch(grid, ["title", "a", "b", "c"])).toEqual({
      a: { order: 1 },
      b: { order: 2 },
      c: { order: 3 },
    });
  });
});

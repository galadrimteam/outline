import { appendedPosition, manualOrder, placeNextTo } from "./positions";
import type { EngineRecordRow } from "./types";

const between = (
  low: number | undefined,
  high: number | undefined,
  count: number
) => {
  const start = low ?? (high ?? 0) - count - 1;
  const end = high ?? (low ?? 0) + count + 1;
  return Array.from(
    { length: count },
    (_, i) => start + ((end - start) * (i + 1)) / (count + 1)
  );
};

function record(
  id: string,
  autoNumber: number,
  orders: Record<string, number> = {}
): EngineRecordRow {
  return {
    id,
    tableId: "tbl",
    cells: {},
    autoNumber,
    orders,
    createdTime: "",
    lastModifiedTime: "",
    createdBy: null,
    lastModifiedBy: null,
  };
}

describe("manualOrder", () => {
  it("sorts by position in the view, then by autoNumber", () => {
    const records = [
      record("a", 1),
      record("b", 2, { v: 0.5 }),
      record("c", 3, { w: 0 }),
      record("d", 4, { v: 1 }),
    ];
    expect(manualOrder(records, "v").map((item) => item.id)).toEqual([
      "b",
      "a",
      "d",
      "c",
    ]);
  });
});

describe("placeNextTo", () => {
  const records = [
    record("a", 1),
    record("b", 2),
    record("c", 3),
    record("d", 4),
  ];

  it("places records between the anchor and its neighbour", () => {
    const positions = placeNextTo(records, "v", ["d"], "b", "before", between);
    expect([...positions.keys()]).toEqual(["d"]);
    const order = manualOrder(
      records.map((item) =>
        positions.has(item.id)
          ? { ...item, orders: { v: positions.get(item.id) ?? 0 } }
          : item
      ),
      "v"
    );
    expect(order.map((item) => item.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("places several records after the last one, in the given order", () => {
    const positions = placeNextTo(
      records,
      "v",
      ["b", "a"],
      "d",
      "after",
      between
    );
    const [b, a] = [positions.get("b") ?? 0, positions.get("a") ?? 0];
    expect(b).toBeGreaterThan(4);
    expect(a).toBeGreaterThan(b);
  });

  it("renumbers the view when the neighbours leave no room", () => {
    const tied = [record("a", 1, { v: 2 }), record("b", 2), record("c", 3)];
    const positions = placeNextTo(tied, "v", ["c"], "b", "before", between);
    expect(Object.fromEntries(positions)).toEqual({ a: 1, c: 2, b: 3 });
  });

  it("refuses an anchor that is not a record of the table", () => {
    expect(() =>
      placeNextTo(records, "v", ["a"], "zzz", "before", between)
    ).toThrow();
  });
});

describe("appendedPosition", () => {
  it("leaves a new record to its autoNumber unless records were moved past it", () => {
    expect(
      appendedPosition([record("a", 1), record("b", 2)], "v", 3)
    ).toBeUndefined();
    expect(
      appendedPosition([record("a", 1, { v: 7.5 }), record("b", 2)], "v", 3)
    ).toBe(8);
  });
});

import { orderByDependencies } from "./graph";

describe("orderByDependencies", () => {
  it("puts every node after its dependencies", () => {
    const edges: Record<string, string[]> = {
      total: ["price", "tax"],
      tax: ["price"],
      price: [],
      label: ["total", "outside"],
    };
    const { order, cyclic } = orderByDependencies(
      ["label", "total", "tax", "price"],
      (node) => edges[node] ?? []
    );
    expect(cyclic.size).toBe(0);
    const position = (node: string) => order.indexOf(node);
    expect(position("price")).toBeLessThan(position("tax"));
    expect(position("tax")).toBeLessThan(position("total"));
    expect(position("total")).toBeLessThan(position("label"));
    expect(order).toHaveLength(4);
  });

  it("finds cycles, self-references included, and keeps their dependents", () => {
    const edges: Record<string, string[]> = {
      a: ["b"],
      b: ["c"],
      c: ["a"],
      d: ["a"],
      e: ["e"],
      f: [],
    };
    const { order, cyclic } = orderByDependencies(
      Object.keys(edges),
      (node) => edges[node]
    );
    expect(Array.from(cyclic).sort((x, y) => x.localeCompare(y))).toEqual([
      "a",
      "b",
      "c",
      "e",
    ]);
    expect(order.indexOf("d")).toBeGreaterThan(order.indexOf("a"));
    expect(order).toHaveLength(6);
  });
});

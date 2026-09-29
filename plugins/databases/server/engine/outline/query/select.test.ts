import { DatabaseFieldType } from "@shared/databases/types";
import { computeBase } from "./computed/computeBase";
import { selectRecords } from "./select";
import {
  contextAt,
  formulaField,
  makeField,
  makeRecord,
  makeTable,
  makeView,
} from "./testFixtures";

const choices = ["Todo", "Doing", "Done"].map((name) => ({
  name,
  color: "gray",
}));
const view = makeView({
  id: "viwBoard",
  filter: {
    conjunction: "and",
    filterSet: [{ fieldId: "status", operator: "isNot", value: "Done" }],
  },
  sort: { sortObjs: [{ fieldId: "points", order: "desc" }] },
  group: [{ fieldId: "status", order: "asc" }],
});
const table = makeTable(
  "tblTasks",
  [
    makeField({ id: "title", type: DatabaseFieldType.SingleLineText }),
    makeField({
      id: "status",
      type: DatabaseFieldType.SingleSelect,
      options: { choices },
    }),
    makeField({ id: "points", type: DatabaseFieldType.Number }),
    formulaField("label", '{title} & " – Élan"', "string"),
  ],
  [
    makeRecord(
      "rec1",
      { title: "a", status: "Doing", points: 1 },
      { orders: { viwBoard: 5 } }
    ),
    makeRecord(
      "rec2",
      { title: "b", status: "Todo", points: 1 },
      { orders: { viwBoard: 1 } }
    ),
    makeRecord("rec3", { title: "c", status: "Doing", points: 8 }),
    makeRecord("rec4", { title: "d", status: "Done", points: 2 }),
    makeRecord(
      "rec5",
      { title: "e", status: "Todo", points: 1 },
      { orders: { viwBoard: 0 } }
    ),
  ],
  [view]
);
const context = contextAt("2025-06-15T10:00:00.000Z");
const base = computeBase([table], context);
const ids = (selection: Parameters<typeof selectRecords>[2]) =>
  selectRecords(table, base, selection, context).map((record) => record.row.id);

describe("selectRecords", () => {
  it("returns every record in creation order without a view", () => {
    expect(ids({})).toEqual(["rec1", "rec2", "rec3", "rec4", "rec5"]);
  });

  it("filters by the view, groups first, then sorts, then by manual order", () => {
    expect(ids({ view })).toEqual(["rec5", "rec2", "rec3", "rec1"]);
  });

  it("ands the reader's filter with the view's, or replaces it", () => {
    const filter = {
      conjunction: "and" as const,
      filterSet: [{ fieldId: "points", operator: "is" as const, value: 1 }],
    };
    expect(ids({ view, filter })).toEqual(["rec5", "rec2", "rec1"]);
    expect(ids({ view, filter, replaceFilter: true })).toEqual([
      "rec5",
      "rec2",
      "rec1",
    ]);
    expect(
      ids({
        view,
        replaceFilter: true,
        filter: {
          conjunction: "and",
          filterSet: [{ fieldId: "status", operator: "is", value: "Done" }],
        },
      })
    ).toEqual(["rec4"]);
  });

  it("puts the reader's sort before the view's, which it may override", () => {
    expect(
      ids({ view, sort: { sortObjs: [{ fieldId: "points", order: "asc" }] } })
    ).toEqual(["rec5", "rec2", "rec1", "rec3"]);
    expect(
      ids({ sort: { sortObjs: [{ fieldId: "title", order: "desc" }] } })
    ).toEqual(["rec5", "rec4", "rec3", "rec2", "rec1"]);
  });

  it("sorts empty cells last in both directions, as Notion, while the empty group comes first", () => {
    const sparse = makeTable(
      "tblSparse",
      [
        makeField({ id: "title", type: DatabaseFieldType.SingleLineText }),
        makeField({
          id: "status",
          type: DatabaseFieldType.SingleSelect,
          options: { choices },
        }),
        makeField({ id: "points", type: DatabaseFieldType.Number }),
      ],
      [
        makeRecord("recA", { title: "a", status: "Todo", points: 3 }),
        makeRecord("recB", { title: "b", status: "Todo" }),
        makeRecord("recC", { title: "c", points: 1 }),
      ],
      []
    );
    const sparseBase = computeBase([sparse], context);
    const order = (selection: Parameters<typeof selectRecords>[2]) =>
      selectRecords(sparse, sparseBase, selection, context).map(
        (record) => record.row.id
      );
    const byPoints = (direction: "asc" | "desc") => ({
      sort: { sortObjs: [{ fieldId: "points", order: direction }] },
    });
    expect(order(byPoints("asc"))).toEqual(["recC", "recA", "recB"]);
    expect(order(byPoints("desc"))).toEqual(["recA", "recC", "recB"]);
    const grouped = makeView({
      id: "viwGrouped",
      group: [{ fieldId: "status", order: "asc" }],
    });
    expect(order({ view: grouped })).toEqual(["recC", "recA", "recB"]);
  });

  it("does not sort a view sorted by hand unless the reader asks", () => {
    const manual = makeView({
      id: "viwBoard",
      sort: {
        sortObjs: [{ fieldId: "points", order: "desc" }],
        manualSort: true,
      },
    });
    expect(ids({ view: manual })).toEqual([
      "rec5",
      "rec2",
      "rec3",
      "rec4",
      "rec1",
    ]);
  });

  it("searches the displayed text of every field, case and accents ignored", () => {
    expect(ids({ search: "ELAN" })).toHaveLength(5);
    expect(ids({ search: " doing " })).toEqual(["rec1", "rec3"]);
    expect(ids({ search: "8" })).toEqual(["rec3"]);
    expect(ids({ search: "   " })).toHaveLength(5);
  });
});

import type { DatabaseField, DatabaseView } from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import {
  EMPTY_STACK,
  boardColumns,
  buildLanes,
  containerKey,
  parseContainerKey,
  cardFields,
  cellTitle,
  dropOrder,
  isManualOrder,
  moveStack,
  stackFilter,
  stackValue,
  toggleStack,
} from "./boardModel";

const field = (overrides: Partial<DatabaseField> = {}): DatabaseField => ({
  id: "fldStatus",
  name: "Statut",
  type: DatabaseFieldType.SingleSelect,
  options: {
    choices: [
      { name: "À faire", color: "grayLight2" },
      { name: "En cours", color: "blueLight2" },
      { name: "Terminé", color: "greenLight2" },
    ],
  },
  isPrimary: false,
  isComputed: false,
  isLookup: false,
  cellValueType: "string",
  isMultipleCellValue: false,
  ...overrides,
});

const view = (overrides: Partial<DatabaseView> = {}): DatabaseView => ({
  id: "viwBoard",
  name: "Board",
  type: "kanban",
  layout: DatabaseLayout.Board,
  order: 0,
  filter: null,
  sort: null,
  group: null,
  columnMeta: {},
  options: { stackFieldId: "fldStatus" },
  overrides: {},
  isLocked: false,
  ...overrides,
});

const keys = (columns: { key: string }[]) =>
  columns.map((column) => column.key);

describe("boardColumns", () => {
  it("puts the empty column first, then the options in order", () => {
    const { visible, hidden } = boardColumns(field(), view());

    expect(keys(visible)).toEqual([
      EMPTY_STACK,
      "À faire",
      "En cours",
      "Terminé",
    ]);
    expect(visible[2].color).toBe("blueLight2");
    expect(visible[0].color).toBeNull();
    expect(hidden).toEqual([]);
  });

  it("follows the saved order and appends new options", () => {
    const { visible } = boardColumns(
      field(),
      view({ overrides: { stackOrder: ["Terminé", EMPTY_STACK, "À faire"] } })
    );

    expect(keys(visible)).toEqual([
      "Terminé",
      EMPTY_STACK,
      "À faire",
      "En cours",
    ]);
  });

  it("ignores saved keys of removed options", () => {
    const { visible } = boardColumns(
      field(),
      view({ overrides: { stackOrder: ["Gone", "En cours"] } })
    );

    expect(keys(visible)).toEqual([
      EMPTY_STACK,
      "En cours",
      "À faire",
      "Terminé",
    ]);
  });

  it("drops the empty column when the view hides it", () => {
    const { visible } = boardColumns(
      field(),
      view({ options: { stackFieldId: "fldStatus", isEmptyStackHidden: true } })
    );

    expect(keys(visible)).not.toContain(EMPTY_STACK);
  });

  it("moves folded columns to the hidden groups", () => {
    const { visible, hidden } = boardColumns(
      field(),
      view({ overrides: { hiddenStacks: ["Terminé", EMPTY_STACK] } })
    );

    expect(keys(visible)).toEqual(["À faire", "En cours"]);
    expect(keys(hidden)).toEqual([EMPTY_STACK, "Terminé"]);
  });
});

describe("stack filter and value", () => {
  it("selects the rows of an option", () => {
    expect(stackFilter("fldStatus", "En cours")).toEqual({
      conjunction: "and",
      filterSet: [{ fieldId: "fldStatus", operator: "is", value: "En cours" }],
    });
    expect(stackValue("En cours")).toBe("En cours");
  });

  it("selects and writes empty rows for the empty column", () => {
    expect(stackFilter("fldStatus", EMPTY_STACK).filterSet[0]).toEqual({
      fieldId: "fldStatus",
      operator: "isEmpty",
      value: null,
    });
    expect(stackValue(EMPTY_STACK)).toBeNull();
  });
});

describe("dropOrder", () => {
  it("has no anchor in an empty column", () => {
    expect(dropOrder([], 0)).toEqual({});
  });

  it("goes before the first card at the top", () => {
    expect(dropOrder(["a", "b"], 0)).toEqual({
      anchorId: "a",
      position: "before",
    });
  });

  it("goes after the card above it", () => {
    expect(dropOrder(["a", "b", "c"], 2)).toEqual({
      anchorId: "b",
      position: "after",
    });
  });

  it("goes after the last card past the end", () => {
    expect(dropOrder(["a", "b"], 9)).toEqual({
      anchorId: "b",
      position: "after",
    });
  });
});

describe("column helpers", () => {
  it("moves a column to another's place", () => {
    expect(moveStack(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveStack(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveStack(["a", "b"], "x", "a")).toEqual(["a", "b"]);
  });

  it("toggles a hidden column", () => {
    expect(toggleStack(undefined, "a")).toEqual(["a"]);
    expect(toggleStack(["a", "b"], "a")).toEqual(["b"]);
  });

  it("tells a manual order from a sorted one", () => {
    expect(isManualOrder(view())).toBe(true);
    expect(
      isManualOrder(
        view({ sort: { sortObjs: [{ fieldId: "f", order: "asc" }] } })
      )
    ).toBe(false);
    expect(isManualOrder(view(), { sortObjs: [] })).toBe(true);
    expect(
      isManualOrder(view(), {
        sortObjs: [{ fieldId: "f", order: "asc" }],
        manualSort: true,
      })
    ).toBe(true);
  });
});

describe("cardFields", () => {
  it("keeps visible non-primary fields in the view's order", () => {
    const fields = [
      field({ id: "name", isPrimary: true }),
      field({ id: "a" }),
      field({ id: "b" }),
      field({ id: "c" }),
    ];
    const result = cardFields(
      fields,
      view({
        columnMeta: {
          name: { order: 0, visible: true },
          a: { order: 3, visible: true },
          b: { order: 1, visible: false },
          c: { order: 2, visible: true },
        },
      })
    );

    expect(result.map((item) => item.id)).toEqual(["c", "a"]);
  });
});

describe("cellTitle", () => {
  it("reads every kind of primary value", () => {
    expect(cellTitle("  Carte  ")).toBe("Carte");
    expect(cellTitle(42)).toBe("42");
    expect(cellTitle(null)).toBe("");
    expect(cellTitle(undefined)).toBe("");
    expect(cellTitle(["a", "b"])).toBe("a, b");
    expect(cellTitle([{ id: "u1", title: "Ada" }])).toBe("Ada");
    expect(cellTitle({ id: "u1", title: "Ada" })).toBe("Ada");
  });
});

describe("lanes", () => {
  const team = field({
    id: "fldTeam",
    name: "Équipe",
    options: {
      choices: [
        { name: "Front", color: "blueLight2" },
        { name: "Back", color: "greenLight2" },
      ],
    },
  });
  const tags = field({
    id: "fldTags",
    name: "Tags",
    type: DatabaseFieldType.MultipleSelect,
    isMultipleCellValue: true,
    options: {
      choices: [
        { name: "Bug", color: "redLight2" },
        { name: "UX", color: "pinkLight2" },
      ],
    },
  });
  const records = new Map([
    ["r1", { id: "r1", fields: { fldTeam: "Back", fldTags: ["UX", "Bug"] } }],
    ["r2", { id: "r2", fields: { fldTeam: "Front", fldTags: ["Bug"] } }],
    ["r3", { id: "r3", fields: { fldTeam: null, fldTags: [] } }],
  ]);
  const columns = [
    { key: "À faire", recordIds: ["r1", "r3"] },
    { key: "En cours", recordIds: ["r2"] },
  ];
  const recordById = (id: string) => records.get(id);

  it("round-trips container keys", () => {
    expect(parseContainerKey(containerKey(undefined, "À faire"))).toEqual({
      lane: undefined,
      column: "À faire",
    });
    expect(parseContainerKey(containerKey("", "En cours"))).toEqual({
      lane: "",
      column: "En cours",
    });
    expect(parseContainerKey(containerKey("Front", ""))).toEqual({
      lane: "Front",
      column: "",
    });
  });

  it("splits cards into lanes in the order of the options", () => {
    const lanes = buildLanes(team, columns, recordById);

    expect(lanes.map((lane) => lane.key)).toEqual(["", "Front", "Back"]);
    expect(lanes[2].cards).toEqual({ "À faire": ["r1"] });
    expect(lanes[1].cards).toEqual({ "En cours": ["r2"] });
    expect(lanes[0].cards).toEqual({ "À faire": ["r3"] });
    expect(lanes.map((lane) => lane.count)).toEqual([1, 1, 1]);
  });

  it("shows a card with several values in each lane, draggable in the first", () => {
    const lanes = buildLanes(tags, columns, recordById);
    const bug = lanes.find((lane) => lane.key === "Bug");
    const ux = lanes.find((lane) => lane.key === "UX");

    expect(ux?.cards).toEqual({ "À faire": ["r1"] });
    expect(bug?.copies).toEqual({ "À faire": ["r1"] });
    expect(bug?.cards).toEqual({ "En cours": ["r2"] });
    expect(bug?.count).toBe(2);
  });

  it("keeps an empty lane on an empty board", () => {
    const lanes = buildLanes(
      team,
      [{ key: "À faire", recordIds: [] }],
      recordById
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0].key).toBe("");
  });
});

import type {
  Active,
  ClientRect,
  Collision,
  DroppableContainer,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { containerKey } from "../../boardModel";
import type { Items } from "./dragModel";
import {
  CardCollision,
  containerOfId,
  entersAfter,
  findContainer,
  moveToContainer,
} from "./dragModel";

interface Point {
  x: number;
  y: number;
}

interface Board {
  columns: string[];
  /** Sub-group lanes, top to bottom. */
  lanes?: string[];
  heights: Record<string, number>;
}

const COLUMN_WIDTH = 276;
const COLUMN_GAP = 12;
const PADDING = 8;
const HEADER = 56;
const CARD_GAP = 8;
const NEW_BUTTON = 32;
const LANE_TITLE = 32;
const CARD_WIDTH = COLUMN_WIDTH - 2 * PADDING;

const rect = (
  left: number,
  top: number,
  width: number,
  height: number
): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const droppable = (
  id: UniqueIdentifier,
  data: Record<string, string>,
  box: ClientRect
): DroppableContainer => ({
  id,
  key: id,
  data: { current: data },
  disabled: false,
  node: { current: null },
  rect: { current: box },
});

const listHeight = (ids: string[], heights: Record<string, number>) =>
  Math.max(
    48,
    ids.reduce((sum, id) => sum + heights[id] + CARD_GAP, 0) + NEW_BUTTON
  );

/**
 * Lays the board out like the browser does: fixed columns, and card lists as
 * tall as their cards, so that a card entering a list moves the cards below.
 */
function layout(board: Board, items: Items): DroppableContainer[] {
  const droppables: DroppableContainer[] = [];
  const addList = (container: string, left: number, top: number, h: number) => {
    droppables.push(
      droppable(
        `body:${container}`,
        { type: "column-body", container },
        rect(left + PADDING, top, CARD_WIDTH, h)
      )
    );
    let y = top;
    for (const id of items[container]) {
      droppables.push(
        droppable(
          id,
          { type: "card", container },
          rect(left + PADDING, y, CARD_WIDTH, board.heights[id])
        )
      );
      y += board.heights[id] + CARD_GAP;
    }
  };
  const lefts = board.columns.map(
    (_, index) => index * (COLUMN_WIDTH + COLUMN_GAP)
  );

  if (!board.lanes) {
    board.columns.forEach((column, index) => {
      const h = listHeight(items[column], board.heights);
      droppables.push(
        droppable(
          `column:${column}`,
          { type: "column", columnKey: column },
          rect(lefts[index], 0, COLUMN_WIDTH, HEADER + h + PADDING)
        )
      );
      addList(column, lefts[index], HEADER, h);
    });
    return droppables;
  }

  board.columns.forEach((column, index) =>
    droppables.push(
      droppable(
        `column:${column}`,
        { type: "column", columnKey: column },
        rect(lefts[index], 0, COLUMN_WIDTH, HEADER)
      )
    )
  );
  let top = HEADER + CARD_GAP;
  for (const lane of board.lanes) {
    top += LANE_TITLE;
    const h = Math.max(
      ...board.columns.map((column) =>
        listHeight(items[containerKey(lane, column)], board.heights)
      )
    );
    board.columns.forEach((column, index) =>
      addList(containerKey(lane, column), lefts[index], top + PADDING, h)
    );
    top += h + 2 * PADDING + CARD_GAP;
  }
  return droppables;
}

/** The collision detection arguments of a card held at a point. */
function argsAt(
  board: Board,
  items: Items,
  activeId: string,
  pointer: Point | null,
  collisionRect = rect(0, 0, CARD_WIDTH, board.heights[activeId])
) {
  const droppableContainers = layout(board, items);
  const active: Active = {
    id: activeId,
    data: {
      current: { type: "card", container: findContainer(activeId, items) },
    },
    rect: { current: { initial: null, translated: null } },
  };
  return {
    active,
    collisionRect,
    droppableRects: new Map(
      droppableContainers.flatMap((item) =>
        item.rect.current ? [[item.id, item.rect.current] as const] : []
      )
    ),
    droppableContainers,
    pointerCoordinates: pointer,
  };
}

/**
 * Drags a card along a path, one frame per point, and returns its container
 * at each frame. Like dnd-kit, a frame is measured on the layout of the
 * previous one, before the DOM shows a move.
 */
function drag(
  board: Board,
  items: Items,
  activeId: string,
  path: Point[]
): string[] {
  const collision = new CardCollision();
  let current = items;
  let shown = items;
  return path.map((pointer) => {
    const collisions = collision.detect(
      argsAt(board, shown, activeId, pointer)
    );
    shown = current;
    const [over] = collisions;
    if (over) {
      current = moveToContainer(
        current,
        activeId,
        String(over.id),
        entersAfter(collisions, over.id)
      );
    }
    return findContainer(activeId, current) ?? "";
  });
}

const still = (point: Point, frames: number): Point[] =>
  Array.from({ length: frames }, () => point);

const changes = (trail: string[]) =>
  trail.filter((container, index) => index && container !== trail[index - 1])
    .length;

const cardCenter = (board: Board, items: Items, id: string): Point => {
  const card = layout(board, items).find((item) => item.id === id);
  const box = card?.rect.current;
  if (!box) {
    throw new Error(`no card ${id}`);
  }
  return { x: box.left + box.width / 2, y: box.top + 15 };
};

// Delisle's « Kanban dev »: a long Backlog next to a To do with one card.
const kanban: Board = {
  columns: ["Backlog", "To do", ""],
  heights: {
    b1: 133,
    b2: 112,
    b3: 39,
    b4: 107,
    b5: 133,
    b6: 133,
    t1: 39,
  },
};
const kanbanItems: Items = {
  Backlog: ["b1", "b2", "b3", "b4", "b5", "b6"],
  "To do": ["t1"],
  "": [],
};
const backlogRight = PADDING + CARD_WIDTH;
const todoLeft = COLUMN_WIDTH + COLUMN_GAP + PADDING;

describe("CardCollision", () => {
  const detect = (pointer: Point | null, items = kanbanItems, id = "b3") =>
    new CardCollision().detect(argsAt(kanban, items, id, pointer));

  it("targets the card under the pointer in another column", () => {
    expect(detect({ x: todoLeft + 20, y: HEADER + 10 })).toEqual([
      { id: "t1", data: { after: false } },
    ]);
  });

  it("targets the nearest card, after it, below the last card", () => {
    expect(detect({ x: todoLeft + 20, y: HEADER + 45 })).toEqual([
      { id: "t1", data: { after: true } },
    ]);
    expect(detect({ x: todoLeft + 20, y: 2000 })).toEqual([
      { id: "t1", data: { after: true } },
    ]);
  });

  it("targets the first card from the column header", () => {
    expect(detect({ x: todoLeft + 20, y: 10 })).toEqual([
      { id: "t1", data: { after: false } },
    ]);
  });

  it("targets the list of an empty column, above or below it", () => {
    const left = 2 * (COLUMN_WIDTH + COLUMN_GAP) + PADDING;
    expect(detect({ x: left + 20, y: HEADER + 10 })).toEqual([
      { id: "body:", data: { after: false } },
    ]);
    expect(detect({ x: left + 20, y: 900 })).toEqual([
      { id: "body:", data: { after: false } },
    ]);
  });

  it("targets nothing between two columns before any target", () => {
    expect(detect({ x: backlogRight + 10, y: HEADER + 10 })).toEqual([]);
  });

  it("keeps its target between two columns", () => {
    const collision = new CardCollision();
    const over = collision.detect(
      argsAt(kanban, kanbanItems, "b3", { x: 50, y: HEADER + 150 })
    );
    expect(over).toEqual([{ id: "b2", data: { after: false } }]);
    expect(
      collision.detect(
        argsAt(kanban, kanbanItems, "b3", {
          x: backlogRight + 10,
          y: HEADER + 150,
        })
      )
    ).toEqual(over);
  });

  it("stays on the moved card between two columns after entering one", () => {
    const collision = new CardCollision();
    collision.detect(
      argsAt(kanban, kanbanItems, "b3", { x: todoLeft + 20, y: HEADER + 10 })
    );
    const moved = moveToContainer(kanbanItems, "b3", "t1", false);
    expect(
      collision.detect(
        argsAt(kanban, moved, "b3", { x: backlogRight + 10, y: HEADER + 10 })
      )
    ).toEqual([{ id: "b3", data: { after: false } }]);
  });

  it("forgets the previous drag", () => {
    const collision = new CardCollision();
    collision.detect(argsAt(kanban, kanbanItems, "b3", { x: 50, y: 200 }));
    collision.reset();
    expect(
      collision.detect(
        argsAt(kanban, kanbanItems, "b3", { x: backlogRight + 10, y: 200 })
      )
    ).toEqual([]);
  });

  it("follows the keyboard onto the droppable its rect was moved to", () => {
    const onTodo = rect(todoLeft, HEADER, CARD_WIDTH, 39);
    expect(
      new CardCollision().detect(
        argsAt(kanban, kanbanItems, "b3", null, onTodo)
      )
    ).toEqual([{ id: "t1", data: { after: false } }]);
  });

  it("ignores the column droppables", () => {
    const [target] = detect({ x: todoLeft + 20, y: HEADER + 10 });
    expect(target.id).not.toMatch(/^column:/);
  });
});

describe("dragging a card", () => {
  it("does not flip between two columns while the pointer rests between them", () => {
    const start = cardCenter(kanban, kanbanItems, "b3");
    for (let y = 20; y <= 700; y += 20) {
      for (let x = backlogRight - 6; x <= todoLeft + 6; x += 1) {
        const trail = drag(kanban, kanbanItems, "b3", [
          start,
          { x: todoLeft + 20, y: HEADER + 10 },
          ...still({ x, y }, 12),
        ]);
        expect(changes(trail.slice(2))).toBeLessThanOrEqual(1);
        expect(new Set(trail.slice(-4)).size).toBe(1);
      }
    }
  });

  it("changes column once when the pointer crosses the gap slowly", () => {
    const start = cardCenter(kanban, kanbanItems, "b3");
    for (const y of [HEADER + 5, HEADER + 30, 300, 500]) {
      const path = [start];
      for (let x = start.x; x <= todoLeft + 30; x += 1) {
        path.push(...still({ x, y }, 3));
      }
      const trail = drag(kanban, kanbanItems, "b3", path);
      expect(changes(trail)).toBe(1);
      expect(trail[trail.length - 1]).toBe("To do");
    }
  });

  it("moves back when the pointer crosses back", () => {
    const start = cardCenter(kanban, kanbanItems, "b3");
    const path = [start];
    for (let x = start.x; x <= todoLeft + 30; x += 2) {
      path.push({ x, y: 300 });
    }
    for (let x = todoLeft + 30; x >= start.x; x -= 2) {
      path.push({ x, y: 300 });
    }
    const trail = drag(kanban, kanbanItems, "b3", path);
    expect(changes(trail)).toBe(2);
    expect(trail[trail.length - 1]).toBe("Backlog");
  });

  it("drops into an empty column from below it", () => {
    const start = cardCenter(kanban, kanbanItems, "b3");
    const left = 2 * (COLUMN_WIDTH + COLUMN_GAP) + PADDING;
    const trail = drag(kanban, kanbanItems, "b3", [
      start,
      ...still({ x: left + 30, y: 600 }, 5),
    ]);
    expect(trail[trail.length - 1]).toBe("");
  });

  describe("on a board with sub-groups", () => {
    const board: Board = {
      columns: ["À faire", "Fait"],
      lanes: ["Achats", "Contrats"],
      heights: { a1: 133, a2: 39, c1: 112, c2: 39 },
    };
    const items: Items = {
      [containerKey("Achats", "À faire")]: ["a1", "a2"],
      [containerKey("Achats", "Fait")]: [],
      [containerKey("Contrats", "À faire")]: ["c1"],
      [containerKey("Contrats", "Fait")]: ["c2"],
    };
    const lists = (current: Items) =>
      layout(board, current).filter(
        (item) => item.data.current?.type === "column-body"
      );

    it("moves a card to another lane and stays there at the boundary", () => {
      const start = cardCenter(board, items, "a2");
      const contrats = lists(items).find(
        (item) => item.id === `body:${containerKey("Contrats", "À faire")}`
      )?.rect.current;
      if (!contrats) {
        throw new Error("no lane");
      }
      for (
        let y = contrats.top - LANE_TITLE - 20;
        y <= contrats.top + 60;
        y++
      ) {
        const path = [start];
        for (let step = start.y; step <= y; step += 3) {
          path.push({ x: start.x, y: step });
        }
        const trail = drag(board, items, "a2", [
          ...path,
          ...still({ x: start.x, y }, 10),
        ]);
        expect(changes(trail)).toBeLessThanOrEqual(1);
        expect(new Set(trail.slice(-6)).size).toBe(1);
      }
    });

    it("keeps the card in its lane over the lane titles", () => {
      const start = cardCenter(board, items, "a2");
      const contrats = lists(items).find(
        (item) => item.id === `body:${containerKey("Contrats", "À faire")}`
      )?.rect.current;
      if (!contrats) {
        throw new Error("no lane");
      }
      const trail = drag(board, items, "a2", [
        start,
        ...still({ x: start.x, y: contrats.top - LANE_TITLE / 2 }, 4),
      ]);
      expect(trail[trail.length - 1]).toBe(containerKey("Achats", "À faire"));
    });

    it("takes the lane's whole cell, below its cards", () => {
      const fait = lists(items).find(
        (item) => item.id === `body:${containerKey("Achats", "Fait")}`
      )?.rect.current;
      if (!fait) {
        throw new Error("no cell");
      }
      const trail = drag(board, items, "a2", [
        cardCenter(board, items, "a2"),
        ...still({ x: fait.left + 20, y: fait.bottom - 5 }, 4),
      ]);
      expect(trail[trail.length - 1]).toBe(containerKey("Achats", "Fait"));
    });
  });
});

describe("moveToContainer", () => {
  it("inserts before or after the card it is over", () => {
    expect(moveToContainer(kanbanItems, "b3", "t1", false)["To do"]).toEqual([
      "b3",
      "t1",
    ]);
    expect(moveToContainer(kanbanItems, "b3", "t1", true)["To do"]).toEqual([
      "t1",
      "b3",
    ]);
    expect(
      moveToContainer(kanbanItems, "b3", "t1", true).Backlog
    ).not.toContain("b3");
  });

  it("appends to the list it is over", () => {
    expect(moveToContainer(kanbanItems, "b3", "body:", false)[""]).toEqual([
      "b3",
    ]);
  });

  it("leaves moves within a container to the sortable strategy", () => {
    expect(moveToContainer(kanbanItems, "b3", "b5", false)).toBe(kanbanItems);
    expect(moveToContainer(kanbanItems, "b3", "body:Nope", false)).toBe(
      kanbanItems
    );
  });
});

describe("entersAfter", () => {
  it("reads the placement of the droppable the card is over", () => {
    const collisions: Collision[] = [
      { id: "t1", data: { after: true } },
      { id: "t2", data: { after: false } },
    ];
    expect(entersAfter(collisions, "t1")).toBe(true);
    expect(entersAfter(collisions, "t2")).toBe(false);
    expect(entersAfter(collisions, "t3")).toBe(false);
    expect(entersAfter(null, "t1")).toBe(false);
  });
});

describe("findContainer", () => {
  it("finds the container of a card, a column or a list", () => {
    expect(findContainer("t1", kanbanItems)).toBe("To do");
    expect(findContainer("body:", kanbanItems)).toBe("");
    expect(findContainer("column:Backlog", kanbanItems)).toBe("Backlog");
    expect(findContainer("unknown", kanbanItems)).toBeUndefined();
    expect(containerOfId("t1")).toBeUndefined();
  });
});

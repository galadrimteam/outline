import type {
  ClientRect,
  Collision,
  CollisionDetection,
  DroppableContainer,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { closestCorners } from "@dnd-kit/core";
import { parseContainerKey } from "../../boardModel";

/** Card ids per container while a card is dragged. */
export type Items = Record<string, string[]>;

type CollisionArgs = Parameters<CollisionDetection>[0];

interface Point {
  x: number;
  y: number;
}

/** Where a dragged card goes. */
interface Target {
  /** The card whose place it takes, or the list of an empty container. */
  id: UniqueIdentifier;
  /** Whether it enters the container after `id` rather than before it. */
  after: boolean;
}

/** A card or a card list, with its container and measured rect. */
interface Zone {
  id: UniqueIdentifier;
  type: "card" | "column-body";
  container: string;
  rect: ClientRect;
}

/**
 * The collision detection of a dragged card. The pointer picks the container:
 * the card list it is in or, on a board without sub-groups, the column it is
 * above or below. Between two containers the card keeps its last target, so
 * that the layout shift of a card entering a column cannot send it back to the
 * previous one.
 */
export class CardCollision {
  /**
   * Forgets the previous drag.
   */
  public reset(): void {
    this.last = undefined;
  }

  /**
   * The droppable a dragged card is over.
   *
   * @param args the arguments of a dnd-kit collision detection.
   * @returns the target alone, or nothing.
   */
  public detect(args: CollisionArgs): Collision[] {
    const zones = measuredZones(args);
    const point = args.pointerCoordinates;
    if (!point) {
      return keyboardCollisions(args, zones);
    }

    const list = listAt(point, zones);
    if (!list) {
      return this.last ? [toCollision(this.last)] : [];
    }
    const target = targetIn(list, point, zones);
    // Entering another container moves its cards under the pointer: until the
    // pointer is over a list again, the card stays where it was inserted.
    this.last =
      list.container === containerOf(args.active.data.current)
        ? target
        : { id: args.active.id, after: false };
    return [toCollision(target)];
  }

  private last: Target | undefined;
}

/**
 * Whether a card entering another container goes after the droppable it is
 * over rather than before it.
 *
 * @param collisions the collisions of the drag event.
 * @param overId the droppable the card is over.
 * @returns true to insert the card after it.
 */
export function entersAfter(
  collisions: Collision[] | null,
  overId: UniqueIdentifier
): boolean {
  return (
    collisions?.find((collision) => collision.id === overId)?.data?.after ===
    true
  );
}

/**
 * The column or container of a column or card list dnd id.
 *
 * @param id the dnd id.
 * @returns the key, or undefined for a card.
 */
export function containerOfId(id: UniqueIdentifier): string | undefined {
  const value = String(id);
  for (const prefix of ["column:", "body:"]) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return undefined;
}

/**
 * The container of a card, or of a column or card list dnd id.
 *
 * @param id the card or dnd id.
 * @param items the card ids per container.
 * @returns the container key, or undefined.
 */
export function findContainer(id: string, items: Items): string | undefined {
  const key = containerOfId(id);
  if (key !== undefined) {
    return key;
  }
  return Object.keys(items).find((container) => items[container].includes(id));
}

/**
 * Moves the dragged card into the container of the droppable it is over.
 * Moves within a container are left to the sortable strategy until the drop.
 *
 * @param items the card ids per container.
 * @param activeId the dragged card.
 * @param overId the card or card list it is over.
 * @param after whether it goes after the card it is over.
 * @returns the new card ids, or `items` when the card stays in its container.
 */
export function moveToContainer(
  items: Items,
  activeId: string,
  overId: string,
  after: boolean
): Items {
  const from = findContainer(activeId, items);
  const to = findContainer(overId, items);
  if (from === undefined || to === undefined || from === to || !(to in items)) {
    return items;
  }

  const target = items[to];
  const overIndex = target.indexOf(overId);
  const index = overIndex === -1 ? target.length : overIndex + (after ? 1 : 0);
  return {
    ...items,
    [from]: items[from].filter((id) => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
  };
}

function measuredZones({
  droppableContainers,
  droppableRects,
}: CollisionArgs): Zone[] {
  return droppableContainers.flatMap((droppable: DroppableContainer) => {
    const type: unknown = droppable.data.current?.type;
    const container = containerOf(droppable.data.current);
    const rect = droppableRects.get(droppable.id);
    if (
      (type !== "card" && type !== "column-body") ||
      container === undefined ||
      !rect
    ) {
      return [];
    }
    return [{ id: droppable.id, type, container, rect }];
  });
}

/**
 * The card list under the point or, without sub-groups, above or below it.
 */
function listAt(point: Point, zones: Zone[]): Zone | undefined {
  const lists = zones.filter((zone) => zone.type === "column-body");
  return (
    lists.find((list) => contains(list.rect, point)) ??
    lists.find(
      (list) =>
        parseContainerKey(list.container).lane === undefined &&
        list.rect.left <= point.x &&
        point.x <= list.rect.right
    )
  );
}

/**
 * The card under the point, else the nearest one of the list, else the empty
 * list itself.
 */
function targetIn(list: Zone, point: Point, zones: Zone[]): Target {
  const cards = zones.filter(
    (zone) => zone.type === "card" && zone.container === list.container
  );
  const under = cards.find((card) => contains(card.rect, point));
  if (under) {
    return { id: under.id, after: false };
  }

  let nearest: Zone | undefined;
  for (const card of cards) {
    if (
      !nearest ||
      distance(card.rect, point) < distance(nearest.rect, point)
    ) {
      nearest = card;
    }
  }
  return nearest
    ? { id: nearest.id, after: point.y > nearest.rect.bottom }
    : { id: list.id, after: false };
}

/**
 * The keyboard sensor places the card's rect onto the droppable an arrow key
 * aimed at, which its closest corners find.
 */
function keyboardCollisions(args: CollisionArgs, zones: Zone[]): Collision[] {
  const ids = new Set(zones.map((zone) => zone.id));
  const [closest] = closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter((droppable) =>
      ids.has(droppable.id)
    ),
  });
  const rect = closest ? args.droppableRects.get(closest.id) : undefined;
  if (!closest || !rect) {
    return [];
  }
  const { collisionRect } = args;
  return [
    toCollision({
      id: closest.id,
      after:
        collisionRect.top + collisionRect.height / 2 >
        rect.top + rect.height / 2,
    }),
  ];
}

function toCollision(target: Target): Collision {
  return { id: target.id, data: { after: target.after } };
}

function containerOf(
  data: Record<string, unknown> | undefined
): string | undefined {
  const container = data?.container;
  return typeof container === "string" ? container : undefined;
}

function contains(rect: ClientRect, point: Point): boolean {
  return (
    rect.left <= point.x &&
    point.x <= rect.right &&
    rect.top <= point.y &&
    point.y <= rect.bottom
  );
}

function distance(rect: ClientRect, point: Point): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

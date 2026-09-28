import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilter,
  DatabaseRecord,
  DatabaseRecordPosition,
  DatabaseSort,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { groupRecords, groupValues } from "./toolbar/grouping";

/** The key of the column holding the rows without a value. */
export const EMPTY_STACK = "";

/** One column of a board. */
export interface BoardColumn {
  /** The option name, or `EMPTY_STACK` for rows without a value. */
  key: string;
  /** The engine colour of the option, null for the empty column. */
  color: string | null;
}

/** The columns of a board, split like Notion into shown and hidden groups. */
export interface BoardColumns {
  visible: BoardColumn[];
  hidden: BoardColumn[];
}

/** One swimlane of a board sub-grouped by a second property. */
export interface BoardLane {
  /** The group key ("" for rows without a value), as the grouping helpers give it. */
  key: string;
  /** The value drawn in the lane header, undefined for the empty lane. */
  value: DatabaseCellValue | undefined;
  /** The draggable cards of each column, by column key, in view order. */
  cards: Record<string, string[]>;
  /** Cards also shown in this lane because they hold several values, not draggable here. */
  copies: Record<string, string[]>;
  /** Distinct cards in the lane. */
  count: number;
}

/** Where a dropped card goes, relative to its new neighbours. */
export interface DropOrder {
  anchorId?: string;
  position?: DatabaseRecordPosition;
}

/**
 * Whether a field can stack a board: one value per row among known options.
 *
 * @param field the field.
 * @returns true for single selects.
 */
export function isStackable(field: DatabaseField | undefined): boolean {
  return field?.type === DatabaseFieldType.SingleSelect;
}

/**
 * Lists the columns of a board: the empty column first, then the options in
 * their order, or in the view's own order when the reader moved columns.
 * Options missing from the saved order keep their place after the saved ones.
 *
 * @param field the field the board is stacked by.
 * @param view the board view.
 * @returns the shown and hidden columns.
 */
export function boardColumns(
  field: DatabaseField,
  view: Pick<DatabaseView, "options" | "overrides">
): BoardColumns {
  const choices = field.options.choices ?? [];
  const colors = new Map(choices.map((choice) => [choice.name, choice.color]));
  const natural = [EMPTY_STACK, ...choices.map((choice) => choice.name)];
  const saved = (view.overrides.stackOrder ?? []).filter((key) =>
    natural.includes(key)
  );
  const unsaved = natural.filter((key) => !saved.includes(key));
  const ordered = unsaved.includes(EMPTY_STACK)
    ? [EMPTY_STACK, ...saved, ...unsaved.filter((key) => key !== EMPTY_STACK)]
    : [...saved, ...unsaved];

  const hiddenKeys = new Set(view.overrides.hiddenStacks ?? []);
  const columns = ordered
    .filter((key) => key !== EMPTY_STACK || !view.options.isEmptyStackHidden)
    .map((key) => ({ key, color: colors.get(key) ?? null }));

  return {
    visible: columns.filter((column) => !hiddenKeys.has(column.key)),
    hidden: columns.filter((column) => hiddenKeys.has(column.key)),
  };
}

/**
 * The filter selecting the rows of one column.
 *
 * @param fieldId the field the board is stacked by.
 * @param key the column key.
 * @returns the filter.
 */
export function stackFilter(fieldId: string, key: string): DatabaseFilter {
  return {
    conjunction: "and",
    filterSet: [
      key === EMPTY_STACK
        ? { fieldId, operator: "isEmpty", value: null }
        : { fieldId, operator: "is", value: key },
    ],
  };
}

/**
 * The value a row takes when it is put in a column.
 *
 * @param key the column key.
 * @returns the cell value.
 */
export function stackValue(key: string): DatabaseCellInput {
  return key === EMPTY_STACK ? null : key;
}

/**
 * Tells where a card dropped at an index of a column goes, as the engine
 * wants it: next to a neighbour.
 *
 * @param ids the ids of the column, without the dropped card.
 * @param index where the card is dropped, 0 being the top.
 * @returns the anchor and the side, empty for an empty column.
 */
export function dropOrder(ids: string[], index: number): DropOrder {
  if (ids.length === 0) {
    return {};
  }
  if (index <= 0) {
    return { anchorId: ids[0], position: "before" };
  }
  return {
    anchorId: ids[Math.min(index, ids.length) - 1],
    position: "after",
  };
}

/**
 * Moves a column to the place of another one.
 *
 * @param keys the column keys, in order.
 * @param from the moved column.
 * @param to the column whose place it takes.
 * @returns the new order.
 */
export function moveStack(keys: string[], from: string, to: string): string[] {
  const fromIndex = keys.indexOf(from);
  const toIndex = keys.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return keys;
  }
  const next = [...keys];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}

/**
 * Hides a shown column or shows a hidden one.
 *
 * @param hiddenStacks the hidden column keys.
 * @param key the column.
 * @returns the new hidden keys.
 */
export function toggleStack(
  hiddenStacks: string[] | undefined,
  key: string
): string[] {
  const hidden = hiddenStacks ?? [];
  return hidden.includes(key)
    ? hidden.filter((item) => item !== key)
    : [...hidden, key];
}

/**
 * Whether cards keep the order people give them, rather than a sort.
 *
 * @param view the board view.
 * @param sort the reader's temporary sort, when any.
 * @returns true when dragging within a column reorders it.
 */
export function isManualOrder(
  view: Pick<DatabaseView, "sort">,
  sort?: DatabaseSort | null
): boolean {
  const effective = sort !== undefined && sort !== null ? sort : view.sort;
  return !effective?.sortObjs.length || !!effective.manualSort;
}

/**
 * The properties shown on cards: visible in the view, in the view's order,
 * the title aside.
 *
 * @param fields the fields of the database.
 * @param view the view.
 * @returns the fields.
 */
export function cardFields(
  fields: DatabaseField[],
  view: Pick<DatabaseView, "columnMeta">
): DatabaseField[] {
  return fields
    .filter((field) => !field.isPrimary && view.columnMeta[field.id]?.visible)
    .sort(
      (a, b) =>
        (view.columnMeta[a.id]?.order ?? 0) -
        (view.columnMeta[b.id]?.order ?? 0)
    );
}

/**
 * The text of a cell used as a title: a row's primary field, a card's name.
 *
 * @param value the cell value.
 * @returns the text, "" when empty.
 */
export function cellTitle(value: DatabaseCellValue | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items
      .map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item)
          : typeof item === "object" &&
              item !== null &&
              "title" in item &&
              typeof item.title === "string"
            ? item.title
            : ""
      )
      .filter(Boolean)
      .join(", ");
  }
  return typeof value.title === "string" ? value.title : "";
}

const laneSeparator = "\u0001";

/**
 * The key of a card container: a column, or a column within a lane.
 *
 * @param lane the lane key, undefined on a board without sub-groups.
 * @param column the column key.
 * @returns the container key.
 */
export function containerKey(lane: string | undefined, column: string): string {
  return lane === undefined ? column : `${lane}${laneSeparator}${column}`;
}

/**
 * Reads a container key written by `containerKey`.
 *
 * @param key the container key.
 * @returns the lane (undefined without sub-groups) and the column.
 */
export function parseContainerKey(key: string): {
  lane: string | undefined;
  column: string;
} {
  const index = key.indexOf(laneSeparator);
  return index === -1
    ? { lane: undefined, column: key }
    : { lane: key.slice(0, index), column: key.slice(index + 1) };
}

/**
 * Splits the loaded cards of each column into lanes by a second property,
 * like Notion's sub-groups. A card with several values shows in each of their
 * lanes, but is only draggable in the first one. There is always at least the
 * empty lane, so that an empty board can still take new cards.
 *
 * @param field the sub-group property.
 * @param columns the columns and their card ids, in view order.
 * @param recordById returns a loaded row.
 * @returns the lanes, in the order of the property's groups.
 */
export function buildLanes(
  field: DatabaseField,
  columns: { key: string; recordIds: string[] }[],
  recordById: (id: string) => DatabaseRecord | undefined
): BoardLane[] {
  const lanes = new Map<string, BoardLane>();
  const seen = new Map<string, Set<string>>();
  const records: DatabaseRecord[] = [];

  const laneFor = (key: string, value: DatabaseCellValue | undefined) => {
    let lane = lanes.get(key);
    if (!lane) {
      lane = { key, value, cards: {}, copies: {}, count: 0 };
      lanes.set(key, lane);
      seen.set(key, new Set());
    }
    return lane;
  };

  for (const column of columns) {
    for (const id of column.recordIds) {
      const record = recordById(id);
      if (!record) {
        continue;
      }
      records.push(record);
      groupValues(field, record.fields[field.id]).forEach((entry, index) => {
        const lane = laneFor(entry.key, entry.value);
        const target = index === 0 ? lane.cards : lane.copies;
        (target[column.key] ??= []).push(id);
        const ids = seen.get(entry.key);
        if (ids && !ids.has(id)) {
          ids.add(id);
          lane.count += 1;
        }
      });
    }
  }

  if (lanes.size === 0) {
    laneFor("", undefined);
  }

  const order = groupRecords(records, field).map((group) => group.key);
  return Array.from(lanes.values()).sort(
    (a, b) => rank(order, a.key) - rank(order, b.key)
  );
}

function rank(order: string[], key: string): number {
  const index = order.indexOf(key);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

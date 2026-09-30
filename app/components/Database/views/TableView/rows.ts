import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroup,
  DatabaseGroupPoint,
  DatabaseRecord,
  DatabaseRecordPosition,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { groupPrefill, groupValues } from "../../toolbar/grouping";

/** One level of the groups a row sits in. */
export interface GroupPathItem {
  fieldId: string;
  value: DatabaseCellValue;
}

/** A group header line. */
export interface GroupDisplayRow {
  type: "group";
  key: string;
  /** The engine's group id, used to fold the group. */
  groupId: string;
  depth: number;
  fieldId: string;
  value: DatabaseCellValue;
  /** Rows in the group, loaded or not. */
  count: number;
  collapsed: boolean;
}

/** A line showing one row of the database. */
export interface RecordDisplayRow {
  type: "record";
  key: string;
  record: DatabaseRecord;
  path: GroupPathItem[];
}

/** The "+ New" line closing a group. */
export interface AddDisplayRow {
  type: "add";
  key: string;
  path: GroupPathItem[];
}

/** The column headers repeated at the top of a group, as Notion draws grouped tables. */
export interface ColumnsDisplayRow {
  type: "columns";
  key: string;
  groupId: string;
}

/** The calculations of one group, under its rows. */
export interface CalculationsDisplayRow {
  type: "calculations";
  key: string;
  groupId: string;
}

export type DisplayRow =
  | GroupDisplayRow
  | RecordDisplayRow
  | AddDisplayRow
  | ColumnsDisplayRow
  | CalculationsDisplayRow;

interface BuildParams {
  /** Loaded rows, in view order (the engine sorts them by group first). */
  records: DatabaseRecord[];
  /** Group headers and counts of the view, when it is grouped. */
  points?: DatabaseGroupPoint[];
  /** Grouping of the view: the field of each depth. */
  group?: DatabaseGroup | null;
  /** Folding chosen by the reader, by group id; the engine's state otherwise. */
  collapsed?: Record<string, boolean>;
  /** Whether more rows can be loaded. */
  hasMore?: boolean;
  /** Whether groups end with a "+ New" line. */
  canCreate?: boolean;
  /** Whether each group of the last level has its own column headers and calculations. */
  perGroupLines?: boolean;
}

/**
 * The lines of a table: rows, preceded by group headers when the view is grouped. The engine
 * returns rows sorted by group and tells how many rows each group holds, so rows are handed out
 * to groups in order; folded groups skip theirs. With `perGroupLines`, each open group of the
 * last level repeats the column headers above its rows and ends with its calculations, like
 * Notion. Lines stop where loaded rows stop.
 *
 * @param params rows, group points and folding.
 * @returns the lines to draw.
 */
export function buildDisplayRows({
  records,
  points,
  group,
  collapsed = {},
  hasMore = false,
  canCreate = false,
  perGroupLines = false,
}: BuildParams): DisplayRow[] {
  if (!group?.length || !points?.length) {
    return records.map((record) => ({
      type: "record",
      key: record.id,
      record,
      path: [],
    }));
  }

  const counts = groupCounts(points);
  const rows: DisplayRow[] = [];
  const path: GroupPathItem[] = [];
  const lastDepth = group.length - 1;
  let hiddenBelow: number | null = null;
  let cursor = 0;
  let openGroupId: string | null = null;

  for (let index = 0; index < points.length; index++) {
    const point = points[index];

    if (point.type === "header") {
      path.length = point.depth;
      path.push({
        fieldId: group[point.depth]?.fieldId ?? "",
        value: point.value,
      });
      if (hiddenBelow !== null && point.depth <= hiddenBelow) {
        hiddenBelow = null;
      }
      if (hiddenBelow !== null) {
        continue;
      }
      const isCollapsed = collapsed[point.id] ?? point.isCollapsed;
      rows.push({
        type: "group",
        key: `group:${point.id}`,
        groupId: point.id,
        depth: point.depth,
        fieldId: group[point.depth]?.fieldId ?? "",
        value: point.value,
        count: counts.get(index) ?? 0,
        collapsed: isCollapsed,
      });
      if (isCollapsed) {
        hiddenBelow = point.depth;
      } else if (perGroupLines && point.depth >= lastDepth) {
        openGroupId = point.id;
        rows.push({
          type: "columns",
          key: `columns:${point.id}`,
          groupId: point.id,
        });
      }
      continue;
    }

    const slice = records.slice(cursor, cursor + point.count);
    cursor += point.count;
    if (hiddenBelow === null) {
      const groupPath = [...path];
      for (const record of slice) {
        rows.push({ type: "record", key: record.id, record, path: groupPath });
      }
      const complete = slice.length === point.count;
      if (canCreate && complete) {
        rows.push({
          type: "add",
          key: `add:${groupPath.map((item) => JSON.stringify(item.value)).join("/")}`,
          path: groupPath,
        });
      }
      if (openGroupId && complete) {
        rows.push({
          type: "calculations",
          key: `calculations:${openGroupId}`,
          groupId: openGroupId,
        });
      }
    }
    openGroupId = null;
    if (cursor > records.length && hasMore) {
      break;
    }
  }

  return rows;
}

/**
 * The cells to write so that a row lands in the groups of a path (a new row created in a group, or
 * a row dragged into another group). Levels whose field cannot be written are left out.
 *
 * @param path the groups, outermost first.
 * @param fieldById looks fields up.
 * @returns the cells by field id.
 */
export function pathPrefill(
  path: GroupPathItem[],
  fieldById: (id: string) => DatabaseField | undefined
): Record<string, DatabaseCellInput> {
  const fields: Record<string, DatabaseCellInput> = {};
  for (const item of path) {
    const field = fieldById(item.fieldId);
    if (!field) {
      continue;
    }
    const input = groupInput(field, item.value);
    if (input !== undefined) {
      fields[field.id] = input;
    }
  }
  return fields;
}

/**
 * The cells that change when a row moves from one group path to another.
 *
 * @param from the path the row leaves.
 * @param to the path the row joins.
 * @param fieldById looks fields up.
 * @returns the cells to write, undefined when the row stays in its groups.
 */
export function pathChange(
  from: GroupPathItem[],
  to: GroupPathItem[],
  fieldById: (id: string) => DatabaseField | undefined
): Record<string, DatabaseCellInput> | undefined {
  const changed = to.filter(
    (item, index) =>
      JSON.stringify(item.value) !== JSON.stringify(from[index]?.value)
  );
  if (!changed.length) {
    return undefined;
  }
  const fields = pathPrefill(changed, fieldById);
  return Object.keys(fields).length ? fields : undefined;
}

/**
 * Whether a dragged row goes before or after the row it is over, from the pointer position.
 *
 * @param pointerY the vertical position of the dragged row's centre.
 * @param rect the row it is over.
 * @returns the side of the drop.
 */
export function dropSide(
  pointerY: number,
  rect: { top: number; height: number }
): DatabaseRecordPosition {
  return pointerY < rect.top + rect.height / 2 ? "before" : "after";
}

function groupInput(
  field: DatabaseField,
  value: DatabaseCellValue
): DatabaseCellInput | undefined {
  if (
    field.type === DatabaseFieldType.MultipleSelect &&
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  ) {
    return value.length ? value : null;
  }
  const entry = groupValues(field, value)[0];
  if (!entry || entry.key === "") {
    return field.isComputed || field.isLookup ? undefined : null;
  }
  return groupPrefill(field, entry);
}

function groupCounts(points: DatabaseGroupPoint[]): Map<number, number> {
  const counts = new Map<number, number>();
  const open: { index: number; depth: number }[] = [];

  points.forEach((point, index) => {
    if (point.type === "header") {
      while (open.length && open[open.length - 1].depth >= point.depth) {
        open.pop();
      }
      open.push({ index, depth: point.depth });
      counts.set(index, 0);
      return;
    }
    for (const header of open) {
      counts.set(header.index, (counts.get(header.index) ?? 0) + point.count);
    }
  });

  return counts;
}

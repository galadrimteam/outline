import type {
  DatabaseRecordOrder,
  DatabaseRecordPosition,
} from "@shared/databases/types";
import { ValidationError } from "@server/errors";
import type { EngineRecordRow } from "./types";
import { existingView } from "./views";
import type { WriteBatch } from "./WriteBatch";

/** Spreads `count` positions strictly between two neighbours (either may be absent). */
export type PositionsBetween = (
  before: number | undefined,
  after: number | undefined,
  count: number
) => number[];

/** Below this gap between two neighbours, the view is renumbered instead. */
const minimumGap = 1e-9;

/**
 * Returns a record's manual position in a view: the one it was moved to, else
 * its autoNumber.
 *
 * @param record the record.
 * @param viewId the view.
 * @returns the position.
 */
export function positionOf(record: EngineRecordRow, viewId: string): number {
  return record.orders?.[viewId] ?? record.autoNumber;
}

/**
 * Returns records in a view's manual order, ties broken by autoNumber.
 *
 * @param records the records.
 * @param viewId the view.
 * @returns the records, sorted (a new array).
 */
export function manualOrder(
  records: EngineRecordRow[],
  viewId: string
): EngineRecordRow[] {
  return [...records].sort(
    (a, b) =>
      positionOf(a, viewId) - positionOf(b, viewId) ||
      a.autoNumber - b.autoNumber
  );
}

/**
 * Returns the positions that put records next to an anchor in a view's manual
 * order, in the given order. When the anchor's neighbours leave no room, the
 * whole view is renumbered and every record of the table gets a position.
 *
 * @param records the table's records (the moved ones among them or not).
 * @param viewId the view.
 * @param movingIds the records to place, in the order they end up in.
 * @param anchorId the record they go next to.
 * @param position before or after the anchor.
 * @param between spreads positions between two neighbours.
 * @returns the new position of each record that moves, by record id.
 * @throws ValidationError when the anchor is not a record of the table.
 */
export function placeNextTo(
  records: EngineRecordRow[],
  viewId: string,
  movingIds: string[],
  anchorId: string,
  position: DatabaseRecordPosition,
  between: PositionsBetween
): Map<string, number> {
  const moving = movingIds.filter((id) => id !== anchorId);
  const movingSet = new Set(moving);
  const ordered = manualOrder(
    records.filter((record) => !movingSet.has(record.id)),
    viewId
  );
  const index = ordered.findIndex((record) => record.id === anchorId);
  if (index < 0) {
    throw ValidationError("The record to move next to does not exist");
  }
  const insertAt = position === "before" ? index : index + 1;
  const previous = ordered[insertAt - 1];
  const next = ordered[insertAt];
  const low = previous ? positionOf(previous, viewId) : undefined;
  const high = next ? positionOf(next, viewId) : undefined;

  if (
    low === undefined ||
    high === undefined ||
    (high - low) / (moving.length + 1) > minimumGap
  ) {
    const positions = between(low, high, moving.length);
    return new Map(moving.map((id, i) => [id, positions[i]]));
  }

  const renumbered = [
    ...ordered.slice(0, insertAt).map((record) => record.id),
    ...moving,
    ...ordered.slice(insertAt).map((record) => record.id),
  ];
  return new Map(renumbered.map((id, i) => [id, i + 1]));
}

/**
 * Returns the position a new record takes at the end of a view, or undefined
 * when its autoNumber already puts it last there (no record was moved past
 * the table's last autoNumber).
 *
 * @param records the table's records.
 * @param viewId the view.
 * @param autoNumber the least autoNumber the new record can get.
 * @returns the explicit position, or undefined.
 */
export function appendedPosition(
  records: EngineRecordRow[],
  viewId: string,
  autoNumber: number
): number | undefined {
  let max: number | undefined;
  for (const record of records) {
    const order = record.orders?.[viewId];
    if (order !== undefined && (max === undefined || order > max)) {
      max = order;
    }
  }
  return max === undefined || max <= autoNumber
    ? undefined
    : Math.floor(max) + 1;
}

/**
 * Places a new record: next to the anchor in the view it was added from,
 * last in the other views.
 *
 * @param batch the write that inserted the record.
 * @param tableId the table.
 * @param recordId the new record.
 * @param order where it was added, if in a view.
 * @param between spreads positions between two neighbours.
 */
export function placeNewRecord(
  batch: WriteBatch,
  tableId: string,
  recordId: string,
  order: DatabaseRecordOrder | undefined,
  between: PositionsBetween
) {
  const { records } = batch.snapshot(tableId);
  const nextAutoNumber =
    records.reduce((max, record) => Math.max(max, record.autoNumber), 0) + 1;
  for (const view of batch.views(tableId)) {
    if (view.id === order?.viewId) {
      continue;
    }
    const position = appendedPosition(records, view.id, nextAutoNumber);
    if (position !== undefined) {
      batch.setPosition(tableId, recordId, view.id, position);
    }
  }
  if (order) {
    moveRecordsNextTo(batch, tableId, [recordId], order, between);
  }
}

/**
 * Moves records next to an anchor in a view's manual order.
 *
 * @param batch the write.
 * @param tableId the table.
 * @param recordIds the records, in the order they end up in.
 * @param order the view, the anchor and the side.
 * @param between spreads positions between two neighbours.
 * @throws NotFoundError when the view does not exist.
 * @throws ValidationError when the anchor is not a record of the table.
 */
export function moveRecordsNextTo(
  batch: WriteBatch,
  tableId: string,
  recordIds: string[],
  order: DatabaseRecordOrder,
  between: PositionsBetween
) {
  existingView(batch, tableId, order.viewId);
  const positions = placeNextTo(
    batch.records(tableId),
    order.viewId,
    recordIds,
    order.anchorId,
    order.position,
    between
  );
  for (const [recordId, position] of positions) {
    batch.setPosition(tableId, recordId, order.viewId, position);
  }
}

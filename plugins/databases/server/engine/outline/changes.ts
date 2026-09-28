import { isEqual } from "es-toolkit";
import type { DatabaseCellChange } from "@server/types";
import { isLinkField, linkIds } from "./links";
import type { ComputedBase } from "./query/contract";
import type { TableSnapshot } from "./types";
import type { WriteBatchTableSummary } from "./WriteBatch";

/** The records of a table a write created, changed and deleted. */
export interface TableCellChanges {
  tableId: string;
  created: string[];
  deleted: string[];
  /** Records present before and after with a cell that changed. */
  updated: string[];
  /** Before and after of every changed cell, computed cells included. */
  changes: DatabaseCellChange[];
}

/** Tables with their computed cells, before or after a write. */
export interface ComputedTables {
  tables: TableSnapshot[];
  computed: ComputedBase;
}

/**
 * Compares the computed cells of the records a write can have changed: the
 * records it wrote (every record of a table whose fields changed), then the
 * records linking to those, and so on, since their lookups, rollups and link
 * titles read them. Records out of reach are left alone, so that a formula
 * reading the clock does not report every record at each write. Tables the
 * write reached without having read them before are left to the write's own
 * summary.
 *
 * @param before the tables before the write.
 * @param after the tables after the write.
 * @param summaries what the write changed in each table.
 * @returns the changes of each table with a record in reach.
 */
export function computedChanges(
  before: ComputedTables,
  after: ComputedTables,
  summaries: WriteBatchTableSummary[]
): TableCellChanges[] {
  const known = new Set(before.tables.map((snapshot) => snapshot.table.id));
  const reached = reachedRecords(before, after, summaries);
  const results: TableCellChanges[] = [];

  for (const snapshot of after.tables) {
    const tableId = snapshot.table.id;
    const recordIds = reached.get(tableId);
    if (!known.has(tableId) || !recordIds?.size) {
      continue;
    }
    const result: TableCellChanges = {
      tableId,
      created: [],
      deleted: [],
      updated: [],
      changes: [],
    };
    for (const recordId of recordIds) {
      const was = before.computed.record(tableId, recordId);
      const is = after.computed.record(tableId, recordId);
      if (!was && is) {
        result.created.push(recordId);
        continue;
      }
      if (was && !is) {
        result.deleted.push(recordId);
        continue;
      }
      if (!was || !is) {
        continue;
      }
      let changed = false;
      for (const field of snapshot.fields) {
        const previous = was.cells[field.id] ?? null;
        const next = is.cells[field.id] ?? null;
        if (!isEqual(previous, next)) {
          changed = true;
          result.changes.push({
            recordId,
            fieldId: field.id,
            before: previous,
            after: next,
          });
        }
      }
      if (changed) {
        result.updated.push(recordId);
      }
    }
    results.push(result);
  }
  return results;
}

/** The records a write touched, and the records linking to them, transitively. */
function reachedRecords(
  before: ComputedTables,
  after: ComputedTables,
  summaries: WriteBatchTableSummary[]
): Map<string, Set<string>> {
  const reached = new Map<string, Set<string>>();
  const add = (tableId: string, recordId: string) => {
    const ids = reached.get(tableId) ?? new Set<string>();
    ids.add(recordId);
    reached.set(tableId, ids);
  };

  for (const summary of summaries) {
    for (const id of [
      ...summary.created,
      ...summary.updated,
      ...summary.deleted,
    ]) {
      add(summary.tableId, id);
    }
    if (summary.fieldIds.length) {
      for (const tables of [before.tables, after.tables]) {
        const snapshot = tables.find(
          (item) => item.table.id === summary.tableId
        );
        for (const record of snapshot?.records ?? []) {
          add(summary.tableId, record.id);
        }
      }
    }
  }

  let grown = true;
  while (grown) {
    grown = false;
    for (const snapshot of after.tables) {
      const tableId = snapshot.table.id;
      const links = snapshot.fields.filter(isLinkField);
      if (!links.length) {
        continue;
      }
      for (const record of snapshot.records) {
        if (reached.get(tableId)?.has(record.id)) {
          continue;
        }
        const linksReached = links.some((field) => {
          const targets = reached.get(field.options.foreignTableId ?? "");
          return (
            !!targets &&
            linkIds(record.cells[field.id]).some((id) => targets.has(id))
          );
        });
        if (linksReached) {
          add(tableId, record.id);
          grown = true;
        }
      }
    }
  }
  return reached;
}

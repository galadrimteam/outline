import type { DatabaseCellValue } from "@shared/databases/types";
import type { EngineFieldRow, TableSnapshot } from "../../types";
import type { ComputedRecord } from "../contract";
import type { CellItem } from "../cellValues";
import {
  cellFromItems,
  cellIds,
  cellItems,
  isAttachmentItem,
  itemId,
} from "../cellValues";
import type { BaseIndex } from "./baseIndex";
import type { ComputedNode } from "./node";
import { clearNode } from "./node";
import { parseRollup, rollupCell } from "./rollup";
import type { ComputedState } from "./state";

/** Where a lookup or a rollup reads: through a link of its table, a field of the linked table. */
interface LinkedSource {
  linkFieldId: string;
  foreignTableId: string | undefined;
  target: EngineFieldRow;
}

/**
 * Builds the node of a lookup field: the values of the looked-up field on
 * the linked records, in link order, as one list (a linked row appears once).
 *
 * @param field the lookup field.
 * @param table its table.
 * @param index the fields of the base.
 * @returns the node.
 */
export function lookupNode(
  field: EngineFieldRow,
  table: TableSnapshot,
  index: BaseIndex
): ComputedNode {
  const source = linkedSource(field, table, index);
  const node: ComputedNode = {
    field,
    table,
    dependencies: source ? [source.target.id] : [],
    evaluate: (state) => {
      if (!source) {
        clearNode(node, state);
        return;
      }
      for (const record of state.records(table.table.id)) {
        const items = dedupe(
          linkedCells(record, source, state).flatMap(cellItems)
        );
        record.cells[field.id] = field.isMultipleCellValue
          ? cellFromItems(items)
          : singleCell(items[0]);
      }
    },
  };
  return node;
}

/**
 * Builds the node of a rollup field: its aggregation (`sum({values})`…)
 * of the looked-up field over the linked records.
 *
 * @param field the rollup field.
 * @param table its table.
 * @param index the fields of the base.
 * @returns the node.
 */
export function rollupNode(
  field: EngineFieldRow,
  table: TableSnapshot,
  index: BaseIndex
): ComputedNode {
  const source = linkedSource(field, table, index);
  const fn = parseRollup(field.options.expression);
  const node: ComputedNode = {
    field,
    table,
    dependencies: source ? [source.target.id] : [],
    evaluate: (state) => {
      if (!source || !fn) {
        clearNode(node, state);
        return;
      }
      for (const record of state.records(table.table.id)) {
        record.cells[field.id] = rollupCell(
          fn,
          linkedCells(record, source, state),
          source.target
        );
      }
    },
  };
  return node;
}

/**
 * Finds where a lookup or a rollup reads.
 *
 * @param field the lookup or rollup field.
 * @param table its table.
 * @param index the fields of the base.
 * @returns the source, or undefined when the link or the looked-up field is gone.
 */
export function linkedSource(
  field: Pick<EngineFieldRow, "lookupOptions">,
  table: TableSnapshot,
  index: BaseIndex
): LinkedSource | undefined {
  const options = field.lookupOptions;
  const link = index.field(options?.linkFieldId);
  if (!options || !link || link.table.table.id !== table.table.id) {
    return undefined;
  }
  const foreignTableId =
    options.foreignTableId || link.field.options.foreignTableId;
  const target = index.field(options.lookupFieldId);
  if (!target || target.table.table.id !== foreignTableId) {
    return undefined;
  }
  return { linkFieldId: link.field.id, foreignTableId, target: target.field };
}

function linkedCells(
  record: ComputedRecord,
  source: LinkedSource,
  state: ComputedState
): (DatabaseCellValue | undefined)[] {
  const ids = cellIds(record.row.cells[source.linkFieldId]);
  return state
    .linked(source.foreignTableId, ids)
    .map((linked) => linked.cells[source.target.id]);
}

function dedupe(items: CellItem[]): CellItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = itemId(item);
    if (id === undefined) {
      return true;
    }
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function singleCell(item: CellItem | undefined): DatabaseCellValue {
  if (item === undefined) {
    return null;
  }
  return isAttachmentItem(item) ? [item] : item;
}

import type { EngineFieldRow, TableSnapshot } from "../../types";
import type { QueryContext } from "../contract";
import type { ComputedState } from "./state";

/** A computed field of a base: what it reads, and how it fills its cells. */
export interface ComputedNode {
  field: EngineFieldRow;
  table: TableSnapshot;
  /** Ids of the fields it reads; those that are not computed are ignored. */
  dependencies: string[];
  /**
   * Fills the field's cell on every record of its table.
   *
   * @param state the records, with the cells computed so far.
   * @param context the current instant and zone.
   */
  evaluate(state: ComputedState, context: QueryContext): void;
}

/**
 * Sets a field's cell to nothing on every record of its table.
 *
 * @param node the computed field.
 * @param state the records.
 */
export function clearNode(node: ComputedNode, state: ComputedState): void {
  for (const record of state.records(node.table.table.id)) {
    record.cells[node.field.id] = null;
  }
}

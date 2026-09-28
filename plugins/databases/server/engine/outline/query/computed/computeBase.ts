import { DatabaseFieldType } from "@shared/databases/types";
import type { EngineFieldRow, TableSnapshot } from "../../types";
import type { ComputedBase, QueryContext } from "../contract";
import { BaseIndex } from "./baseIndex";
import { formulaNode } from "./formulaNode";
import { orderByDependencies } from "./graph";
import { linkNode } from "./linkNode";
import { lookupNode, rollupNode } from "./linkedValueNodes";
import type { ComputedNode } from "./node";
import { clearNode } from "./node";
import { ComputedState } from "./state";

/**
 * Computes every computed cell of a base: link titles, lookups, rollups and
 * formulas, across tables, each field after the fields it reads. The fields
 * of a cycle get no value. Created and modified times, auto numbers and the
 * ids of creators and modifiers are filled from the records.
 *
 * @param tables every table of the base.
 * @param context the current instant and zone.
 * @returns the records with their computed cells.
 */
export function computeBase(
  tables: TableSnapshot[],
  context: QueryContext
): ComputedBase {
  const index = new BaseIndex(tables);
  const state = new ComputedState(tables);
  const nodes = new Map<string, ComputedNode>();
  for (const table of tables) {
    for (const field of table.fields) {
      const node = nodeOf(field, table, index);
      if (node) {
        nodes.set(field.id, node);
      }
    }
  }

  const { order, cyclic } = orderByDependencies(
    Array.from(nodes.keys()),
    (fieldId) => nodes.get(fieldId)?.dependencies ?? []
  );
  for (const fieldId of order) {
    const node = nodes.get(fieldId);
    if (!node) {
      continue;
    }
    if (cyclic.has(fieldId)) {
      clearNode(node, state);
    } else {
      node.evaluate(state, context);
    }
  }
  return state;
}

function nodeOf(
  field: EngineFieldRow,
  table: TableSnapshot,
  index: BaseIndex
): ComputedNode | undefined {
  if (field.isLookup) {
    return lookupNode(field, table, index);
  }
  switch (field.type) {
    case DatabaseFieldType.Formula:
      return formulaNode(field, table, index);
    case DatabaseFieldType.Rollup:
      return rollupNode(field, table, index);
    case DatabaseFieldType.Link:
      return linkNode(field, table, index);
    default:
      return undefined;
  }
}

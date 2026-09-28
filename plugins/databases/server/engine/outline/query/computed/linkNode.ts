import type { DatabaseLinkValue } from "@shared/databases/types";
import type { EngineFieldRow, TableSnapshot } from "../../types";
import { cellIds } from "../cellValues";
import type { BaseIndex } from "./baseIndex";
import type { ComputedNode } from "./node";

/**
 * Builds the node filling a link's titles: each linked record's text in the
 * field the link shows (its `lookupFieldId`, else the primary field of the
 * linked table). Links to records that no longer exist are dropped; a link
 * to a table outside the base keeps its ids.
 *
 * @param field the link field.
 * @param table its table.
 * @param index the fields of the base.
 * @returns the node.
 */
export function linkNode(
  field: EngineFieldRow,
  table: TableSnapshot,
  index: BaseIndex
): ComputedNode {
  const foreignTableId = field.options.foreignTableId;
  const shown = index.field(field.options.lookupFieldId);
  const titleField =
    shown && shown.table.table.id === foreignTableId
      ? shown.field
      : index.primaryField(foreignTableId);
  const foreignKnown = !!index.table(foreignTableId);

  return {
    field,
    table,
    dependencies: titleField ? [titleField.id] : [],
    evaluate: (state) => {
      for (const record of state.records(table.table.id)) {
        const ids = cellIds(record.row.cells[field.id]);
        const links: DatabaseLinkValue[] = foreignKnown
          ? state.linked(foreignTableId, ids).map((linked) => ({
              id: linked.row.id,
              title: state.title(linked, titleField),
            }))
          : ids.map((id) => ({ id }));
        if (field.isMultipleCellValue) {
          record.cells[field.id] = links.length ? links : null;
        } else {
          record.cells[field.id] = links[0] ?? null;
        }
      }
    },
  };
}

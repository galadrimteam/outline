import type { EngineFieldRow, TableSnapshot } from "../../types";
import { fieldReferences } from "../formula/ast";
import type { Compiled, FormulaScope } from "../formula/compiled";
import { compileNode } from "../formula/compiler";
import { parseFormula } from "../formula/parser";
import type { ValueType } from "../formula/values";
import { cellOfValue, convertValue } from "../formula/values";
import { safeTimeZone } from "../time/zone";
import type { BaseIndex } from "./baseIndex";
import type { ComputedNode } from "./node";
import { clearNode } from "./node";

/**
 * Builds the node of a formula field. The result is converted to the type
 * the field declares; a formula that cannot be read, or fails on a record,
 * leaves the cell empty.
 *
 * @param field the formula field.
 * @param table its table.
 * @param index the fields of the base.
 * @returns the node.
 */
export function formulaNode(
  field: EngineFieldRow,
  table: TableSnapshot,
  index: BaseIndex
): ComputedNode {
  const resolve = index.resolver(table);
  let compiled: Compiled | null = null;
  let dependencies: string[] = [];
  try {
    const ast = parseFormula(field.options.expression ?? "");
    dependencies = fieldReferences(ast).flatMap((reference) => {
      const referenced = resolve(reference);
      return referenced ? [referenced.id] : [];
    });
    compiled = compileNode(ast, resolve);
  } catch (_err) {
    compiled = null;
  }

  const node: ComputedNode = {
    field,
    table,
    dependencies,
    evaluate: (state, context) => {
      if (!compiled) {
        clearNode(node, state);
        return;
      }
      const declared: ValueType = {
        type: field.cellValueType,
        isMultiple: field.isMultipleCellValue,
      };
      const timeZone = safeTimeZone(field.options.timeZone ?? context.timeZone);
      const records = state.records(table.table.id);
      if (!records.length) {
        return;
      }
      const scope: FormulaScope = {
        cells: records[0].cells,
        record: records[0].row,
        now: context.now.getTime(),
        timeZone,
      };
      for (const record of records) {
        scope.cells = record.cells;
        scope.record = record.row;
        try {
          const value = convertValue(
            compiled.run(scope),
            compiled.type,
            declared,
            timeZone,
            compiled.field
          );
          record.cells[field.id] = cellOfValue(value, declared);
        } catch (_err) {
          record.cells[field.id] = null;
        }
      }
    },
  };
  return node;
}

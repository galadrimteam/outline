import { DatabaseFieldType } from "@shared/databases/types";
import type { EngineFieldRow, TableSnapshot } from "../../types";
import type { InferredType } from "../contract";
import { FormulaError } from "../formula/ast";
import { compileFormula } from "../formula/compiler";
import type { ValueType } from "../formula/values";
import { BaseIndex } from "./baseIndex";
import { linkedSource } from "./linkedValueNodes";
import { parseRollup, rollupType } from "./rollup";

type FieldDefinition = Pick<
  EngineFieldRow,
  "type" | "options" | "lookupOptions"
>;

/**
 * Tells what a field's cells hold. A formula is typed from its expression, a
 * rollup from its aggregation and the looked-up field, a lookup (a field with
 * lookup options that is no rollup) takes the looked-up field's type and is
 * a list when the link or that field is; other fields have their type's.
 *
 * @param field the field, existing or about to be created.
 * @param table the table holding it.
 * @param tables every table of the base, to follow links.
 * @returns the type, with the reason when the field cannot be computed.
 */
export function inferFieldType(
  field: FieldDefinition,
  table: TableSnapshot,
  tables: TableSnapshot[]
): InferredType {
  const index = new BaseIndex([
    table,
    ...tables.filter((other) => other.table.id !== table.table.id),
  ]);
  try {
    return typed(computedType(field, table, index));
  } catch (err) {
    return {
      cellValueType: "string",
      isMultipleCellValue: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * The type of the cells of a field that is not computed.
 *
 * @param field the field.
 * @returns the type.
 */
export function naturalType(
  field: Pick<EngineFieldRow, "type" | "options">
): ValueType {
  switch (field.type) {
    case DatabaseFieldType.Number:
    case DatabaseFieldType.Rating:
    case DatabaseFieldType.AutoNumber:
      return { type: "number", isMultiple: false };
    case DatabaseFieldType.Checkbox:
      return { type: "boolean", isMultiple: false };
    case DatabaseFieldType.Date:
    case DatabaseFieldType.CreatedTime:
    case DatabaseFieldType.LastModifiedTime:
      return { type: "dateTime", isMultiple: false };
    case DatabaseFieldType.MultipleSelect:
    case DatabaseFieldType.Attachment:
      return { type: "string", isMultiple: true };
    case DatabaseFieldType.User:
      return { type: "string", isMultiple: !!field.options.isMultiple };
    case DatabaseFieldType.Link:
      return {
        type: "string",
        isMultiple:
          field.options.relationship !== "manyOne" &&
          field.options.relationship !== "oneOne",
      };
    default:
      return { type: "string", isMultiple: false };
  }
}

function computedType(
  field: FieldDefinition,
  table: TableSnapshot,
  index: BaseIndex
): ValueType {
  switch (field.type) {
    case DatabaseFieldType.Formula:
      return compileFormula(
        field.options.expression ?? "",
        index.resolver(table)
      ).type;
    case DatabaseFieldType.Rollup: {
      const fn = parseRollup(field.options.expression);
      if (!fn) {
        throw new FormulaError(
          `Unknown rollup expression « ${field.options.expression ?? ""} »`
        );
      }
      const target = sourceOf(field, table, index);
      return rollupType(fn, {
        type: target.cellValueType,
        isMultiple: target.isMultipleCellValue,
      });
    }
    case DatabaseFieldType.ConditionalRollup:
      throw new FormulaError("Conditional rollups are not supported");
    default:
      break;
  }
  if (field.lookupOptions) {
    const target = sourceOf(field, table, index);
    const link = index.field(field.lookupOptions.linkFieldId)?.field;
    return {
      type: target.cellValueType,
      isMultiple: !!link?.isMultipleCellValue || target.isMultipleCellValue,
    };
  }
  return naturalType(field);
}

function sourceOf(
  field: FieldDefinition,
  table: TableSnapshot,
  index: BaseIndex
) {
  const source = linkedSource(field, table, index);
  if (!source) {
    throw new FormulaError("The link or the looked-up field no longer exists");
  }
  return source.target;
}

function typed(type: ValueType): InferredType {
  return { cellValueType: type.type, isMultipleCellValue: type.isMultiple };
}

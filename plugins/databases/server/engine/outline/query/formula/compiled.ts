import type { DatabaseCellValue } from "@shared/databases/types";
import type { QueryField } from "../fields";
import type { Scalar, Value, ValueType } from "./values";

/** The record a formula is computed for, as system functions read it. */
export interface ScopeRecord {
  id: string;
  autoNumber: number;
  createdTime: string;
  lastModifiedTime: string;
}

/** What a compiled formula reads when it runs for one record. */
export interface FormulaScope {
  /** The record's cells, computed ones included, by field id. */
  cells: Record<string, DatabaseCellValue>;
  record: ScopeRecord;
  /** The current instant, UTC milliseconds. */
  now: number;
  /** The zone of dates written without one, of TODAY() and date parts. */
  timeZone: string;
}

/** A formula node ready to run, with the type it gives. */
export interface Compiled {
  type: ValueType;
  /** BLANK(): gives nothing, and does not decide the type of an IF. */
  isBlank?: boolean;
  /** The field a reference reads, for the way it writes its dates. */
  field?: QueryField;
  /** The value of a literal, known before running (units, formats). */
  constant?: Scalar;
  run(scope: FormulaScope): Value;
}

/** A function of the formula language. */
export interface FormulaFunction {
  minArgs: number;
  /** Unlimited when absent. */
  maxArgs?: number;
  /**
   * Builds the function's node from its compiled arguments.
   *
   * @param args the arguments.
   * @returns the node.
   */
  compile(args: Compiled[]): Compiled;
}

/** Finds the field a `{reference}` designates. */
export type FieldResolver = (reference: string) => QueryField | undefined;

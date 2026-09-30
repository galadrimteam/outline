import type {
  DatabaseField,
  DatabaseStatisticFunc,
  DatabaseView,
} from "@shared/databases/types";
import type Database from "~/models/Database";

/** What a board column header shows after the group's name. */
export type ColumnCalculation =
  | { kind: "count" }
  | { kind: "none" }
  | { kind: "field"; func: DatabaseStatisticFunc; field: DatabaseField };

/**
 * Resolves the calculation of a board's column headers: the number of cards
 * unless the view names a calculation over a property that still exists.
 *
 * @param database the database, for its fields.
 * @param view the board view.
 * @returns the calculation.
 */
export function columnCalculation(
  database: Pick<Database, "fieldById">,
  view: Pick<DatabaseView, "overrides">
): ColumnCalculation {
  const calculation = view.overrides.groupCalculation;
  if (calculation?.func === "none") {
    return { kind: "none" };
  }
  if (!calculation || calculation.func === "count" || !calculation.fieldId) {
    return { kind: "count" };
  }
  const field = database.fieldById(calculation.fieldId);
  return field
    ? { kind: "field", func: calculation.func, field }
    : { kind: "count" };
}

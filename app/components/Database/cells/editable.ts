import type { DatabaseField } from "@shared/databases/types";

/**
 * Whether a field stores what readers type (not a formula, rollup or lookup).
 *
 * @param field the field.
 * @returns true when its cells can be written.
 */
export function isWritable(field: DatabaseField): boolean {
  return !field.isComputed && !field.isLookup;
}

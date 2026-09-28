import type { QueryField } from "./fields";
import type { RecordPredicate } from "./filters/filter";
import { cellText, searchKey } from "./text";

/**
 * Builds the test of a search: the displayed text of any field contains the
 * searched text, case and accents ignored.
 *
 * @param search the searched text.
 * @param fields the fields searched.
 * @returns the predicate, or null for a blank search.
 */
export function compileSearch(
  search: string | undefined,
  fields: QueryField[]
): RecordPredicate | null {
  const needle = searchKey(search?.trim() ?? "");
  if (!needle) {
    return null;
  }
  return (cells) =>
    fields.some((field) =>
      searchKey(cellText(cells[field.id], field)).includes(needle)
    );
}

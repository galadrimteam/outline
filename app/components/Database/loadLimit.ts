import type { DatabaseView } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";

/** Layouts that end with « Load more » instead of loading as the reader scrolls. */
const pagedLayouts = new Set([DatabaseLayout.List, DatabaseLayout.Gallery]);

/**
 * The number of rows a view loads before « Load more »: Notion's load limit,
 * which only applies to a database shown inside a page.
 *
 * @param view the view.
 * @param fullPage whether the database fills its page.
 * @returns the page size, or undefined for the default one.
 */
export function viewPageSize(
  view: Pick<DatabaseView, "layout" | "overrides">,
  fullPage: boolean
): number | undefined {
  if (fullPage || !pagedLayouts.has(view.layout)) {
    return undefined;
  }
  return view.overrides.loadLimit;
}

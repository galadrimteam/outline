import * as React from "react";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";

/** The rows a grouped view loads at most, as the timeline and the calendar do. */
export const MAX_GROUPED_ROWS = 2000;

/**
 * Loads the rows of a query page after page while `enabled`, up to
 * `MAX_GROUPED_ROWS`: a grouped gallery or list splits every row into its
 * group, so that each group counts all its rows and pages them itself.
 *
 * @param query the rows of the view.
 * @param enabled whether to load them all.
 * @returns whether rows are left beyond the cap.
 */
export function useAllRecords(query: RecordQuery, enabled: boolean): boolean {
  const { hasMore, isLoading, error } = query;
  const loaded = query.records.length;

  React.useEffect(() => {
    if (
      enabled &&
      hasMore &&
      !isLoading &&
      !error &&
      loaded < MAX_GROUPED_ROWS
    ) {
      void query.loadMore();
    }
  }, [enabled, query, hasMore, isLoading, error, loaded]);

  return enabled && hasMore && loaded >= MAX_GROUPED_ROWS;
}

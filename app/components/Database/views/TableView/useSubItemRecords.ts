import * as React from "react";
import type { DatabaseRecord } from "@shared/databases/types";
import useStores from "~/hooks/useStores";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import type { SubItems } from "./subItems";
import { childrenFilter } from "./subItems";

const NONE: ReadonlyMap<string, DatabaseRecord[]> = new Map();

/**
 * Loads the sub-items of the unfolded rows of a nested table, each with the
 * view's filter and order and the reader's search, like the rows of the
 * table. To be used in an observer component: the result follows the rows as
 * they load and change.
 *
 * @param query the rows of the table.
 * @param subItems the sub-items of the view, when it nests them.
 * @param unfolded the rows whose sub-items are shown.
 * @returns the loaded sub-items of each unfolded row.
 */
export function useSubItemRecords(
  query: RecordQuery,
  subItems: SubItems | undefined,
  unfolded: ReadonlySet<string>
): ReadonlyMap<string, DatabaseRecord[]> {
  const { databaseRecords } = useStores();

  const queries = React.useMemo(() => {
    const byParent = new Map<string, RecordQuery>();
    if (!subItems) {
      return byParent;
    }
    for (const parentId of unfolded) {
      byParent.set(
        parentId,
        databaseRecords.query(query.databaseId, query.viewId, {
          ...query.params,
          extraFilter: childrenFilter(subItems, parentId),
          pageSize: 200,
        })
      );
    }
    return byParent;
  }, [databaseRecords, query, subItems, unfolded]);

  React.useEffect(() => {
    for (const childQuery of queries.values()) {
      void childQuery.fetch();
    }
  }, [queries]);

  if (!queries.size) {
    return NONE;
  }
  return new Map(
    Array.from(queries, ([parentId, childQuery]) => [
      parentId,
      childQuery.records,
    ])
  );
}

import type { DatabaseSortItem } from "@shared/databases/types";
import type { TableSnapshot } from "../types";
import type {
  ComputedBase,
  ComputedRecord,
  QueryContext,
  RecordSelection,
} from "./contract";
import { fieldsById } from "./fields";
import { andFilters, compileFilter } from "./filters/filter";
import { compileSearch } from "./search";
import { sortLevels, sortRecords } from "./sort";
import { safeTimeZone } from "./time/zone";

/**
 * Returns the records of a table a read shows, in order: the view's filter
 * and the selection's (or the selection's alone with `replaceFilter`), the
 * search, then the order — the view's grouping first so that grouped rows
 * stay together (as Teable puts its group-by before any sort), then the
 * selection's sort, the view's sort (unless sorted by hand, with no
 * selection sort), the view's manual order, and creation.
 *
 * @param table the table.
 * @param base the computed base holding it.
 * @param selection the view, filter, sort and search.
 * @param context the reader, the current instant and zone.
 * @returns the records.
 */
export function selectRecords(
  table: TableSnapshot,
  base: ComputedBase,
  selection: RecordSelection,
  context: QueryContext
): ComputedRecord[] {
  const { view } = selection;
  const fields = fieldsById(table.fields);
  const timeZone = safeTimeZone(context.timeZone);
  const filter = compileFilter(
    selection.replaceFilter
      ? selection.filter
      : andFilters(view?.filter, selection.filter),
    fields,
    { now: context.now.getTime(), timeZone, userId: context.userId }
  );
  const search = compileSearch(selection.search, table.fields);

  const records = base
    .records(table.table.id)
    .filter(
      (record) =>
        (!filter || filter(record.cells)) && (!search || search(record.cells))
    );

  const levels = [
    ...sortLevels(view?.group, fields),
    ...sortLevels(mergeSorts(selection.sort?.sortObjs, view?.sort), fields, {
      emptiesLast: true,
    }),
  ];
  return sortRecords(records, levels, view?.id);
}

function mergeSorts(
  selectionSort: DatabaseSortItem[] | undefined,
  viewSort:
    | { sortObjs: DatabaseSortItem[]; manualSort?: boolean }
    | null
    | undefined
): DatabaseSortItem[] {
  const first = selectionSort ?? [];
  if (!viewSort || (viewSort.manualSort && !first.length)) {
    return first;
  }
  const taken = new Set(first.map((item) => item.fieldId));
  return [
    ...first,
    ...viewSort.sortObjs.filter((item) => !taken.has(item.fieldId)),
  ];
}

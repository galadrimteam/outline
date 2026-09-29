import type { DatabaseCellValue } from "@shared/databases/types";
import type {
  EngineHistoryRow,
  EngineRecordRow,
  EngineRecordUpdate,
  EngineTableMutation,
  TableSnapshot,
} from "../types";

/**
 * Returns a table after a mutation, as both stores apply it: the name, then
 * fields and views (a deleted field loses its cells in every record, a
 * deleted view its positions), then records (inserted ones get the next
 * autoNumbers when theirs is 0; an update merges cells, a null value clearing
 * one, and positions), then the version bump. Updated records are stamped
 * with the actor and the time only when a cell changes, so that moving a
 * card does not count as editing it.
 *
 * @param snapshot the table before the mutation, left untouched.
 * @param mutation what changes.
 * @param actorId the engine user making the change.
 * @param now the time of the change.
 * @returns the table after the mutation, and the history rows to keep.
 */
export function applyMutation(
  snapshot: TableSnapshot,
  mutation: EngineTableMutation,
  actorId: string | null,
  now: Date
): { snapshot: TableSnapshot; history: EngineHistoryRow[] } {
  const table = {
    ...snapshot.table,
    name: mutation.name ?? snapshot.table.name,
    version: snapshot.table.version + 1,
  };

  const deletedFieldIds = new Set(mutation.fields?.delete ?? []);
  const upsertedFields = new Map(
    (mutation.fields?.upsert ?? []).map((field) => [field.id, field])
  );
  const fields = [
    ...snapshot.fields.map((field) => upsertedFields.get(field.id) ?? field),
    ...[...upsertedFields.values()].filter(
      (field) => !snapshot.fields.some((existing) => existing.id === field.id)
    ),
  ]
    .filter((field) => !deletedFieldIds.has(field.id))
    .sort((a, b) => a.order - b.order);

  const deletedViewIds = new Set(mutation.views?.delete ?? []);
  const upsertedViews = new Map(
    (mutation.views?.upsert ?? []).map((view) => [view.id, view])
  );
  const views = [
    ...snapshot.views.map((view) => upsertedViews.get(view.id) ?? view),
    ...[...upsertedViews.values()].filter(
      (view) => !snapshot.views.some((existing) => existing.id === view.id)
    ),
  ]
    .filter((view) => !deletedViewIds.has(view.id))
    .sort((a, b) => a.order - b.order);

  const updates = new Map(
    (mutation.records?.update ?? []).map((update) => [update.id, update])
  );
  const deletedRecordIds = new Set(mutation.records?.delete ?? []);
  const stamp = now.toISOString();

  let records = snapshot.records.map((record) => {
    let next = record;
    if (deletedFieldIds.size || deletedViewIds.size) {
      next = {
        ...next,
        cells: omitKeys(next.cells, deletedFieldIds),
        orders: omitKeys(next.orders, deletedViewIds),
      };
    }
    const update = updates.get(record.id);
    return update ? updatedRecord(next, update, actorId, stamp) : next;
  });

  let maxAutoNumber = records.reduce(
    (max, record) => Math.max(max, record.autoNumber),
    0
  );
  for (const inserted of mutation.records?.insert ?? []) {
    const autoNumber = inserted.autoNumber || ++maxAutoNumber;
    maxAutoNumber = Math.max(maxAutoNumber, autoNumber);
    records.push({
      ...inserted,
      tableId: table.id,
      cells: withoutNulls(inserted.cells),
      autoNumber,
    });
  }
  records = records
    .filter((record) => !deletedRecordIds.has(record.id))
    .sort((a, b) => a.autoNumber - b.autoNumber);

  return {
    snapshot: { table, fields, views, records },
    history: mutation.history ?? [],
  };
}

/**
 * Tells whether an update changes cells, and so stamps the record as edited.
 *
 * @param update the record update.
 * @returns true when cells are set or removed.
 */
export function changesCells(update: EngineRecordUpdate): boolean {
  return (
    Object.keys(update.cells ?? {}).length > 0 ||
    (update.unsetFieldIds?.length ?? 0) > 0
  );
}

function updatedRecord(
  record: EngineRecordRow,
  update: EngineRecordUpdate,
  actorId: string | null,
  stamp: string
): EngineRecordRow {
  const cells = { ...record.cells };
  for (const [fieldId, value] of Object.entries(update.cells ?? {})) {
    if (value === null) {
      delete cells[fieldId];
    } else {
      cells[fieldId] = value;
    }
  }
  for (const fieldId of update.unsetFieldIds ?? []) {
    delete cells[fieldId];
  }
  const edited = changesCells(update);
  return {
    ...record,
    cells,
    orders: { ...record.orders, ...update.orders },
    lastModifiedTime: edited ? stamp : record.lastModifiedTime,
    lastModifiedBy: edited ? actorId : record.lastModifiedBy,
  };
}

function omitKeys<T>(
  values: Record<string, T>,
  keys: Set<string>
): Record<string, T> {
  if (!keys.size || !Object.keys(values).some((key) => keys.has(key))) {
    return values;
  }
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!keys.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function withoutNulls(
  cells: Record<string, DatabaseCellValue>
): Record<string, DatabaseCellValue> {
  const result: Record<string, DatabaseCellValue> = {};
  for (const [fieldId, value] of Object.entries(cells)) {
    if (value !== null && value !== undefined) {
      result[fieldId] = value;
    }
  }
  return result;
}

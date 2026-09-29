import type {
  DatabaseCellValue,
  DatabaseLinkValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { ValidationError } from "@server/errors";
import { isMultipleRelationship } from "./schema";
import type { EngineFieldRow } from "./types";
import type { WriteBatch } from "./WriteBatch";

/**
 * Returns the record ids a link cell holds, stored (`{id}` list) or read
 * (`{id, title}` object or list).
 *
 * @param value the cell value.
 * @returns the linked record ids, in order, without repeats.
 */
export function linkIds(value: DatabaseCellValue | undefined): string[] {
  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const item of items) {
    const id =
      typeof item === "string"
        ? item
        : typeof item === "object" &&
            item !== null &&
            "id" in item &&
            typeof item.id === "string"
          ? item.id
          : undefined;
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Returns the stored value of a link cell.
 *
 * @param ids the linked record ids.
 * @returns the `{id}` list, or null for no link.
 */
export function linkValue(ids: string[]): DatabaseLinkValue[] | null {
  return ids.length ? ids.map((id) => ({ id })) : null;
}

/**
 * Tells whether a field is a link written by hand (not a lookup of one).
 *
 * @param field the field.
 * @returns true for a link field.
 */
export function isLinkField(field: EngineFieldRow): boolean {
  return field.type === DatabaseFieldType.Link && !field.isLookup;
}

/**
 * Returns the symmetric field of a two-way link, in the linked table.
 *
 * @param batch the write.
 * @param field the link field.
 * @returns the symmetric field, or undefined for a one-way link.
 */
export function symmetricFieldOf(
  batch: WriteBatch,
  field: EngineFieldRow
): EngineFieldRow | undefined {
  const { foreignTableId, symmetricFieldId, isOneWay } = field.options;
  if (isOneWay || !foreignTableId || !symmetricFieldId) {
    return undefined;
  }
  return batch.field(foreignTableId, symmetricFieldId);
}

/**
 * Tells whether a link cell holds several records.
 *
 * @param field the link field.
 * @returns true for manyMany and oneMany links.
 */
export function holdsSeveral(field: EngineFieldRow): boolean {
  return field.options.relationship
    ? isMultipleRelationship(field.options.relationship)
    : field.isMultipleCellValue;
}

/**
 * Sets the records a link cell points to, and keeps the other side in step:
 * the symmetric cell of each record added gains this record, of each record
 * removed loses it. When the other side holds one record only, a record
 * taken from another one is removed from that one's cell.
 *
 * @param batch the write.
 * @param tableId the table of the record.
 * @param recordId the record.
 * @param field the link field.
 * @param ids the records to link, in order.
 * @throws ValidationError when a record to link does not exist.
 */
export function setLinks(
  batch: WriteBatch,
  tableId: string,
  recordId: string,
  field: EngineFieldRow,
  ids: string[]
) {
  const foreignTableId = field.options.foreignTableId;
  if (!foreignTableId || !batch.hasTable(foreignTableId)) {
    throw ValidationError(`The field "${field.name}" links to no table`);
  }
  let next = [...new Set(ids)];
  if (!holdsSeveral(field) && next.length > 1) {
    next = next.slice(0, 1);
  }
  for (const id of next) {
    if (!batch.record(foreignTableId, id)) {
      throw ValidationError("A linked record does not exist");
    }
  }

  const previous = linkIds(batch.cell(tableId, recordId, field.id));
  batch.setCell(tableId, recordId, field.id, linkValue(next));

  const symmetric = symmetricFieldOf(batch, field);
  if (!symmetric) {
    return;
  }
  const removed = previous.filter((id) => !next.includes(id));
  const added = next.filter((id) => !previous.includes(id));

  for (const id of removed) {
    const current = linkIds(batch.cell(foreignTableId, id, symmetric.id));
    batch.setCell(
      foreignTableId,
      id,
      symmetric.id,
      linkValue(current.filter((item) => item !== recordId))
    );
  }
  for (const id of added) {
    const current = linkIds(batch.cell(foreignTableId, id, symmetric.id));
    if (holdsSeveral(symmetric)) {
      batch.setCell(
        foreignTableId,
        id,
        symmetric.id,
        linkValue([...current.filter((item) => item !== recordId), recordId])
      );
      continue;
    }
    for (const owner of current) {
      if (owner !== recordId) {
        const owned = linkIds(batch.cell(tableId, owner, field.id));
        batch.setCell(
          tableId,
          owner,
          field.id,
          linkValue(owned.filter((item) => item !== id))
        );
      }
    }
    batch.setCell(foreignTableId, id, symmetric.id, linkValue([recordId]));
  }
}

/**
 * Removes deleted records from every link cell pointing at them, in every
 * table of the write.
 *
 * @param batch the write.
 * @param tableId the table of the deleted records.
 * @param recordIds the deleted records.
 */
export function unlinkRecords(
  batch: WriteBatch,
  tableId: string,
  recordIds: string[]
) {
  const deleted = new Set(recordIds);
  for (const otherId of batch.tableIds()) {
    const fields = batch
      .fields(otherId)
      .filter(
        (field) =>
          isLinkField(field) && field.options.foreignTableId === tableId
      );
    if (!fields.length) {
      continue;
    }
    for (const record of batch.records(otherId)) {
      for (const field of fields) {
        const ids = linkIds(record.cells[field.id]);
        if (ids.some((id) => deleted.has(id))) {
          batch.setCell(
            otherId,
            record.id,
            field.id,
            linkValue(ids.filter((id) => !deleted.has(id)))
          );
        }
      }
    }
  }
}

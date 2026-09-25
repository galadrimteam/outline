import type { DatabaseRecord } from "@shared/databases/types";
import type { Database } from "@server/models";
import { Document } from "@server/models";
import { DatabaseUserMapper } from "../utils/DatabaseUserMapper";

/**
 * Completes engine records with what Outline knows: the page of each row, when
 * it has been opened once, and the Outline user behind each person value.
 * Two queries per page of records, whatever its size.
 *
 * @param database the database the records belong to.
 * @param records the records.
 * @returns the records, ready for the API.
 */
export async function presentDatabaseRecords(
  database: Database,
  records: DatabaseRecord[]
): Promise<DatabaseRecord[]> {
  if (!records.length) {
    return records;
  }
  const [documents] = await Promise.all([
    Document.unscoped().findAll({
      attributes: ["id", "databaseRecordId"],
      where: {
        databaseId: database.id,
        databaseRecordId: records.map((record) => record.id),
      },
    }),
    DatabaseUserMapper.enrich(database.teamId, records),
  ]);
  const documentIdByRecordId = new Map(
    documents.map((document) => [document.databaseRecordId, document.id])
  );
  return records.map((record) => ({
    ...record,
    documentId: documentIdByRecordId.get(record.id) ?? null,
  }));
}

/**
 * Completes one engine record, see `presentDatabaseRecords`.
 *
 * @param database the database the record belongs to.
 * @param record the record.
 * @returns the record, ready for the API.
 */
export async function presentDatabaseRecord(
  database: Database,
  record: DatabaseRecord
): Promise<DatabaseRecord> {
  const [presented] = await presentDatabaseRecords(database, [record]);
  return presented;
}

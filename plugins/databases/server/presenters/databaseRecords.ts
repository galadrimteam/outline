import type { DatabaseRecord } from "@shared/databases/types";
import type { Database } from "@server/models";
import type { DatabaseActor } from "../engine/DatabaseEngine";
import { engineFor, refFor } from "../engine";
import { DatabaseRowIcons } from "../utils/DatabaseRowIcons";
import { DatabaseUserMapper } from "../utils/DatabaseUserMapper";

/**
 * Completes engine records with what Outline knows: the page of each row and
 * its icon, when it has been opened once, and the Outline user behind each
 * person value. Given the reader, relation values also get the icon of the
 * linked row's page. A few queries per page of records, whatever its size.
 *
 * @param database the database the records belong to.
 * @param records the records.
 * @param actor the reader, to read the relations of the table.
 * @returns the records, ready for the API.
 */
export async function presentDatabaseRecords(
  database: Database,
  records: DatabaseRecord[],
  actor?: DatabaseActor
): Promise<DatabaseRecord[]> {
  if (!records.length) {
    return records;
  }
  const [pages] = await Promise.all([
    DatabaseRowIcons.ofRows(
      database.id,
      records.map((record) => record.id)
    ),
    DatabaseUserMapper.enrich(database.teamId, records),
    actor && DatabaseRowIcons.mayHoldLinks(records)
      ? engineFor(database)
          .getSchema(actor, refFor(database))
          .then(({ fields }) =>
            DatabaseRowIcons.enrichLinks(database.teamId, fields, records)
          )
      : undefined,
  ]);
  return records.map((record) => {
    const page = pages.get(record.id);
    return {
      ...record,
      documentId: page?.documentId ?? null,
      icon: page?.icon ?? null,
      iconColor: page?.iconColor ?? null,
    };
  });
}

/**
 * Completes one engine record, see `presentDatabaseRecords`.
 *
 * @param database the database the record belongs to.
 * @param record the record.
 * @param actor the reader, to read the relations of the table.
 * @returns the record, ready for the API.
 */
export async function presentDatabaseRecord(
  database: Database,
  record: DatabaseRecord,
  actor?: DatabaseActor
): Promise<DatabaseRecord> {
  const [presented] = await presentDatabaseRecords(database, [record], actor);
  return presented;
}

import { uniq } from "es-toolkit/compat";
import type { DatabaseField } from "@shared/databases/types";
import { Database } from "@server/models";
import type { DatabaseSchema } from "../engine/DatabaseEngine";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";

/**
 * Completes an engine schema with what Outline knows: the view overrides and
 * field metadata of the database, and the Outline database each link field
 * points to (`options.foreignDatabaseId`), in one query.
 *
 * @param database the database.
 * @param schema the engine schema.
 * @returns the schema, ready for the API.
 */
export async function presentDatabaseSchema(
  database: Database,
  schema: DatabaseSchema
): Promise<DatabaseSchema> {
  const applied = DatabaseSettingsHelper.applyToSchema(
    schema,
    database.settings
  );
  return {
    ...applied,
    fields: await withForeignDatabases(database, applied.fields),
  };
}

/**
 * Completes one engine field, see `presentDatabaseSchema`.
 *
 * @param database the database.
 * @param field the engine field.
 * @returns the field, ready for the API.
 */
export async function presentDatabaseField(
  database: Database,
  field: DatabaseField
): Promise<DatabaseField> {
  const [presented] = await withForeignDatabases(database, [
    DatabaseSettingsHelper.applyToField(field, database.settings),
  ]);
  return presented;
}

async function withForeignDatabases(
  database: Database,
  fields: DatabaseField[]
): Promise<DatabaseField[]> {
  const tableIds = uniq(
    fields.flatMap((field) =>
      field.options.foreignTableId ? [field.options.foreignTableId] : []
    )
  );
  if (!tableIds.length) {
    return fields;
  }
  const databases = await Database.findAll({
    attributes: ["id", "externalTableId"],
    where: { teamId: database.teamId, externalTableId: tableIds },
  });
  const databaseIdByTable = new Map(
    databases.map((item) => [item.externalTableId, item.id])
  );
  return fields.map((field) => {
    const foreignDatabaseId = field.options.foreignTableId
      ? databaseIdByTable.get(field.options.foreignTableId)
      : undefined;
    return foreignDatabaseId
      ? { ...field, options: { ...field.options, foreignDatabaseId } }
      : field;
  });
}

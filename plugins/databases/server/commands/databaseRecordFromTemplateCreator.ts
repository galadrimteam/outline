import type {
  DatabaseCellInput,
  DatabaseRecord,
  DatabaseRecordOrder,
} from "@shared/databases/types";
import { TextHelper } from "@shared/utils/TextHelper";
import type { DatabaseCommandContext } from "@server/commands/databaseRowDocumentCreator";
import { databaseRowDocumentCreator } from "@server/commands/databaseRowDocumentCreator";
import type { Database, Document, Template, User } from "@server/models";
import type { DatabaseEngine } from "../engine/DatabaseEngine";
import { refFor } from "../engine";
import { actorFor } from "../utils/actor";
import { DatabaseUserMapper } from "../utils/DatabaseUserMapper";

interface RecordFromTemplateProps {
  /** The user creating the row, authorized to update the database. */
  user: User;
  /** The database the row is added to. */
  database: Database;
  /** The template of the row's page, which the user may read. */
  template: Template;
  /** The engine of the database. */
  engine: DatabaseEngine;
  /** The row's first values by field id. */
  fields: Record<string, DatabaseCellInput>;
  /** Where the row goes in a view. */
  order?: DatabaseRecordOrder;
}

interface RecordFromTemplate {
  record: DatabaseRecord;
  document: Document;
}

/**
 * Creates a database row and its page from an Outline template, like Notion's
 * database templates: the page gets the template's body, and the row gets the
 * template's title and icon unless the given values already hold them.
 *
 * @param ctx the request context, or the acting user with an optional transaction.
 * @param props the user, the database, the template and the row's values.
 * @returns the created row and its page.
 */
export async function databaseRecordFromTemplateCreator(
  ctx: DatabaseCommandContext,
  { user, database, template, engine, fields, order }: RecordFromTemplateProps
): Promise<RecordFromTemplate> {
  const actor = actorFor(user);
  const ref = refFor(database);
  const { fields: schema } = await engine.getSchema(actor, ref);
  const primaryId = schema.find((field) => field.isPrimary)?.id;
  const iconFieldId = schema.some(
    (field) => field.id === database.settings?.iconFieldId
  )
    ? database.settings?.iconFieldId
    : undefined;

  const values = { ...fields };
  const given = primaryId ? values[primaryId] : undefined;
  const title =
    typeof given === "string" && given.trim()
      ? given
      : TextHelper.replaceTemplateVariables(template.title ?? "", user);
  if (primaryId && title && !given) {
    values[primaryId] = title;
  }
  const givenIcon = iconFieldId ? values[iconFieldId] : undefined;
  const icon =
    typeof givenIcon === "string" && givenIcon ? givenIcon : template.icon;
  if (iconFieldId && icon && !givenIcon) {
    values[iconFieldId] = icon;
  }

  const record = await engine.createRecord(actor, ref, {
    fields: await DatabaseUserMapper.resolveInputs(
      engine,
      database.teamId,
      values
    ),
    order,
  });
  const document = await databaseRowDocumentCreator(ctx, {
    database,
    recordId: record.id,
    title,
    icon: icon ?? null,
    template,
  });
  return { record, document };
}

import { t } from "i18next";
import type {
  DatabaseField,
  DatabaseSettings,
  DatabaseView,
} from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseLayout,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import type { Collection, User } from "@server/models";
import { Database, Document } from "@server/models";
import { opts } from "@server/utils/i18n";
import { MutexLock } from "@server/utils/MutexLock";
import { engineFor } from "../engine";
import type { DatabaseTableFieldCreate } from "../engine/DatabaseEngine";
import env from "../env";
import { actorFor } from "../utils/actor";
import { DatabaseSettingsHelper } from "../utils/DatabaseSettingsHelper";

interface DatabaseCreatorProps {
  /** The user creating the database, who creates the engine table. */
  user: User;
  /** The collection the database belongs to. */
  collection: Collection;
  /** The home document the database is anchored on, if any. */
  document?: Document | null;
  title?: string;
  layout: DatabaseLayout;
  /** The engine the data goes to; `DATABASES_ENGINE` when not given. */
  engine?: string;
}

interface CreatedDatabase {
  database: Database;
  fields: DatabaseField[];
  views: DatabaseView[];
}

/**
 * Creates a database: an engine table with a title field « Name », a status
 * field « Status » (To do, In progress, Done) and a first view of the chosen
 * layout, anchored on a document or a collection.
 *
 * The table goes into the base of the nearest ancestor document that anchors
 * a database of the same engine, else into the base the collection already
 * uses on that engine, else into a new base named after the collection: a
 * base never spans two engines, since links stay inside a base. Creations in
 * a collection are serialized, so that two first databases do not create two
 * bases.
 *
 * @param props the creation parameters.
 * @returns the database with its schema, overrides applied.
 */
export async function databaseCreator({
  user,
  collection,
  document,
  title,
  layout,
  engine: engineName = env.DATABASES_ENGINE,
}: DatabaseCreatorProps): Promise<CreatedDatabase> {
  const engine = engineFor({ engine: engineName, teamId: collection.teamId });
  const i18n = opts(user);
  const name = title || t("Untitled", i18n);
  const fields = defaultFields(layout, user);

  return MutexLock.using(
    `databases:base:${collection.id}`,
    MutexLock.defaultLockTimeout,
    async () => {
      const externalBaseId =
        (await baseOfAncestors(document, engineName)) ??
        (await baseOfCollection(collection, engineName)) ??
        (await engine.createBase(collection.name || name));

      const table = await engine.createTable(actorFor(user), externalBaseId, {
        name,
        fields,
        view: {
          name: layoutName(layout, user),
          layout,
          stackFieldKey: "status",
          dateFieldKey: "date",
        },
      });

      const settings = initialSettings(
        layout,
        fields,
        table.fieldIds,
        table.views
      );
      const database = await Database.create({
        teamId: collection.teamId,
        collectionId: collection.id,
        documentId: document?.id ?? null,
        title: name,
        engine: engineName,
        externalBaseId,
        externalTableId: table.externalTableId,
        settings,
        createdById: user.id,
      });

      const schema = DatabaseSettingsHelper.applyToSchema(
        { fields: table.fields, views: table.views },
        settings
      );
      return { database, ...schema };
    }
  );
}

/** The name of the first view, after its layout. */
function layoutName(layout: DatabaseLayout, user: User): string {
  const i18n = opts(user);
  switch (layout) {
    case DatabaseLayout.Board:
      return t("Board", i18n);
    case DatabaseLayout.Calendar:
      return t("Calendar", i18n);
    case DatabaseLayout.Gallery:
      return t("Gallery", i18n);
    case DatabaseLayout.List:
      return t("List", i18n);
    case DatabaseLayout.Timeline:
      return t("Timeline", i18n);
    case DatabaseLayout.Form:
      return t("Form", i18n);
    default:
      return t("Table", i18n);
  }
}

function defaultFields(
  layout: DatabaseLayout,
  user: User
): DatabaseTableFieldCreate[] {
  const i18n = opts(user);
  const fields: DatabaseTableFieldCreate[] = [
    {
      key: "name",
      name: t("Name", i18n),
      type: DatabaseFieldType.SingleLineText,
    },
    {
      key: "status",
      name: t("Status", i18n),
      type: DatabaseFieldType.SingleSelect,
      options: {
        choices: [
          { name: t("To do", i18n), color: "grayBright" },
          { name: t("In progress", i18n), color: "blueBright" },
          { name: t("Done", i18n), color: "greenBright" },
        ],
      },
    },
  ];
  if (
    layout === DatabaseLayout.Calendar ||
    layout === DatabaseLayout.Timeline
  ) {
    fields.push({
      key: "date",
      name: t("Date", i18n),
      type: DatabaseFieldType.Date,
    });
  }
  return fields;
}

function initialSettings(
  layout: DatabaseLayout,
  fields: DatabaseTableFieldCreate[],
  fieldIds: Record<string, string>,
  views: DatabaseView[]
): DatabaseSettings {
  let settings: DatabaseSettings = {};

  const statusChoices =
    fields.find((field) => field.key === "status")?.options?.choices ?? [];
  if (fieldIds.status && statusChoices.length) {
    const groups = [
      DatabaseStatusGroup.ToDo,
      DatabaseStatusGroup.InProgress,
      DatabaseStatusGroup.Complete,
    ];
    const statusGroups: Record<string, DatabaseStatusGroup> = {};
    statusChoices.forEach((choice, index) => {
      statusGroups[choice.name] = groups[index] ?? DatabaseStatusGroup.ToDo;
    });
    settings = DatabaseSettingsHelper.merge(settings, {
      fieldMeta: { [fieldIds.status]: { statusGroups } },
    });
  }

  const [view] = views;
  if (view && layout === DatabaseLayout.List) {
    settings = DatabaseSettingsHelper.mergeViewOverrides(settings, view.id, {
      layout: DatabaseLayout.List,
    });
  }
  if (view && layout === DatabaseLayout.Timeline) {
    settings = DatabaseSettingsHelper.mergeViewOverrides(settings, view.id, {
      layout: DatabaseLayout.Timeline,
      timeline: { startFieldId: fieldIds.date, endFieldId: fieldIds.date },
    });
  }
  return settings;
}

async function baseOfAncestors(
  document: Document | null | undefined,
  engine: string
): Promise<string | null> {
  if (!document) {
    return null;
  }
  const ancestorIds = [document.id];
  let parentId = document.parentDocumentId;
  while (parentId && ancestorIds.length < 50) {
    ancestorIds.push(parentId);
    const parent = await Document.unscoped().findByPk(parentId, {
      attributes: ["id", "parentDocumentId"],
    });
    parentId = parent?.parentDocumentId ?? null;
  }

  const databases = await Database.findAll({
    attributes: ["documentId", "externalBaseId"],
    where: { teamId: document.teamId, documentId: ancestorIds, engine },
  });
  for (const id of ancestorIds) {
    const match = databases.find((database) => database.documentId === id);
    if (match) {
      return match.externalBaseId;
    }
  }
  return null;
}

async function baseOfCollection(
  collection: Collection,
  engine: string
): Promise<string | null> {
  const database = await Database.findOne({
    attributes: ["externalBaseId"],
    where: { teamId: collection.teamId, collectionId: collection.id, engine },
    order: [["createdAt", "ASC"]],
  });
  return database?.externalBaseId ?? null;
}

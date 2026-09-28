import { groupBy } from "es-toolkit";
import type { Transaction } from "sequelize";
import { Database } from "@server/models";
import type { User } from "@server/models";
import type { DatabaseDuplicatedTable } from "../engine/DatabaseTablesDuplicator";
import { tablesDuplicatorFor } from "../engine/tablesDuplicator";
import { actorFor } from "../utils/actor";
import { remapEngineIds } from "../utils/remapEngineIds";

/** A database to copy, and where its copy is anchored. */
export interface DatabaseDuplication {
  source: Database;
  collectionId: string;
  /** The home document of the copy, null to anchor it on the collection. */
  documentId: string | null;
  /** The title of the copy, the source's when not given. */
  title?: string;
}

/** A database and its copy. */
export interface DuplicatedDatabase {
  source: Database;
  database: Database;
  /** Engine id of each field of the copy, keyed by the id of its source field. */
  fieldIds: Record<string, string>;
  /** Engine id of each view of the copy, keyed by the id of its source view. */
  viewIds: Record<string, string>;
}

interface Props {
  /** The user the copies are made for and created by. */
  user: User;
  /** The databases to copy together; a database listed twice is copied once. */
  duplications: DatabaseDuplication[];
  /** Whether the rows are copied too. */
  withRecords: boolean;
  /** The transaction the Outline databases are created in. */
  transaction?: Transaction | null;
}

/**
 * Copies databases: their engine tables, each into the base of its source,
 * and their Outline settings with the view and field ids of the copies. The
 * databases copied together keep their relations between the copies, which
 * is what makes a project template out of a page and its databases. The
 * caller authorizes the user on the sources and on the new anchors.
 *
 * @param props the user, the databases and whether rows are copied.
 * @returns each copy, in the order of the duplications.
 */
export async function databasesDuplicator({
  user,
  duplications,
  withRecords,
  transaction,
}: Props): Promise<DuplicatedDatabase[]> {
  const unique = [
    ...new Map(duplications.map((item) => [item.source.id, item])).values(),
  ];
  const groups = groupBy(
    unique,
    (item) => `${item.source.engine}:${item.source.externalBaseId}`
  );

  // Every engine copy is made before any Outline row, so that a failing
  // engine leaves no database behind.
  const copied: {
    item: DatabaseDuplication;
    table: DatabaseDuplicatedTable;
  }[] = [];
  for (const items of Object.values(groups)) {
    const [first] = items;
    const tables = await tablesDuplicatorFor(first.source).duplicateTables(
      actorFor(user),
      {
        externalBaseId: first.source.externalBaseId,
        tables: items.map((item) => ({
          externalTableId: item.source.externalTableId,
          name: item.title ?? item.source.title,
        })),
        withRecords,
      }
    );
    items.forEach((item, index) => copied.push({ item, table: tables[index] }));
  }

  const results = new Map<string, DuplicatedDatabase>();
  for (const { item, table } of copied) {
    const { source } = item;
    const database = await Database.create(
      {
        teamId: source.teamId,
        collectionId: item.collectionId,
        documentId: item.documentId,
        title: item.title ?? source.title,
        icon: source.icon,
        engine: source.engine,
        externalBaseId: source.externalBaseId,
        externalTableId: table.externalTableId,
        settings: remapEngineIds(source.settings ?? {}, {
          ...table.fieldIds,
          ...table.viewIds,
        }),
        createdById: user.id,
      },
      { transaction }
    );
    results.set(source.id, {
      source,
      database,
      fieldIds: table.fieldIds,
      viewIds: table.viewIds,
    });
  }

  return unique.flatMap((item) => {
    const result = results.get(item.source.id);
    return result ? [result] : [];
  });
}

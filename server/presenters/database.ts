import type { DatabaseSettings } from "@shared/databases/types";
import type { Database } from "@server/models";

/** A database as the API returns it. */
export interface PresentedDatabase {
  id: string;
  title: string;
  icon: string | null;
  collectionId: string;
  documentId: string | null;
  /** The app path that resolves to the database's anchor. */
  url: string;
  settings: DatabaseSettings;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Serializes a database for the API. The engine ids never leave the server.
 *
 * @param database the database to present.
 * @returns the serialized database.
 */
export function presentDatabase(database: Database): PresentedDatabase {
  return {
    id: database.id,
    title: database.title,
    icon: database.icon,
    collectionId: database.collectionId,
    documentId: database.documentId,
    url: `/db/${database.id}`,
    settings: database.settings ?? {},
    createdAt: database.createdAt,
    updatedAt: database.updatedAt,
  };
}

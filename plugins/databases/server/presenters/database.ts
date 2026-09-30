import type { Database, User } from "@server/models";
import { presentDatabase } from "@server/presenters";
import type { PresentedDatabase } from "@server/presenters/database";

/** A database as the API returns it to a given user. */
export interface PresentedDatabaseForUser extends PresentedDatabase {
  /** The engine base, for admins only (migration tools). */
  externalBaseId?: string;
  /** The engine table, for admins only (migration tools). */
  externalTableId?: string;
  /** The automations turned on, for the people who may edit the database. */
  automationCount?: number;
}

/**
 * Serializes a database for a user: admins also get the engine ids, which the
 * migration tools need to find the tables again.
 *
 * @param user the user the database is presented to.
 * @param database the database.
 * @returns the serialized database.
 */
export function presentDatabaseForUser(
  user: User,
  database: Database
): PresentedDatabaseForUser {
  const presented = presentDatabase(database);
  if (!user.isAdmin) {
    return presented;
  }
  return {
    ...presented,
    externalBaseId: database.externalBaseId,
    externalTableId: database.externalTableId,
  };
}

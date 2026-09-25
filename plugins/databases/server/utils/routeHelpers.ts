import type { Transaction } from "sequelize";
import type { DatabaseSettings } from "@shared/databases/types";
import { AuthenticationError, NotFoundError } from "@server/errors";
import type { User } from "@server/models";
import { Database } from "@server/models";
import { authorize } from "@server/policies";
import type { APIContext } from "@server/types";
import { sequelize } from "@server/storage/database";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";

/** Rate limits of the database routes, per user. A board reads once per column. */
export const DatabaseRateLimit = {
  Read: { duration: 60, requests: 1200 },
  Write: { duration: 60, requests: 300 },
  Schema: RateLimiterStrategy.OneHundredPerMinute,
  Create: RateLimiterStrategy.TwentyFivePerMinute,
};

/**
 * Returns the signed-in user of a route that accepts anonymous requests.
 *
 * @param ctx the request context.
 * @returns the user.
 * @throws AuthenticationError when nobody is signed in.
 */
export function authenticatedUser(ctx: APIContext): User {
  const { user } = ctx.state.auth;
  if (!user) {
    throw AuthenticationError("Authentication required");
  }
  return user;
}

/**
 * Loads a database with its anchor and checks that the user may act on it.
 *
 * @param user the user.
 * @param id the database id.
 * @param action the ability required.
 * @param options.transaction an optional transaction.
 * @returns the database.
 * @throws NotFoundError when the database does not exist.
 * @throws AuthorizationError when the user lacks the ability.
 */
export async function loadDatabase(
  user: User,
  id: string,
  action: "read" | "update" | "delete",
  options: { transaction?: Transaction } = {}
): Promise<Database> {
  const database = await Database.findByPkForUser(id, user.id, options);
  if (!database) {
    throw NotFoundError("Database not found");
  }
  authorize(user, action, database);
  return database;
}

/**
 * Reloads a database row locked for update, to change its settings without
 * losing a concurrent change.
 *
 * @param database the database.
 * @param transaction the transaction holding the lock.
 * @returns the locked row.
 */
export async function lockDatabase(
  database: Database,
  transaction: Transaction
): Promise<Database> {
  return Database.findByPk(database.id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
    rejectOnEmpty: true,
  });
}

/**
 * Changes the settings of a database under a row lock, and keeps the given
 * instance in sync.
 *
 * @param database the database.
 * @param change returns the new settings from the current ones.
 * @returns the new settings.
 */
export async function updateDatabaseSettings(
  database: Database,
  change: (settings: DatabaseSettings) => DatabaseSettings
): Promise<DatabaseSettings> {
  const settings = await sequelize.transaction(async (transaction) => {
    const locked = await lockDatabase(database, transaction);
    locked.settings = change(locked.settings ?? {});
    locked.changed("settings", true);
    await locked.save({ transaction });
    return locked.settings;
  });
  database.settings = settings;
  return settings;
}

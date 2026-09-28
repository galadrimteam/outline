import { InternalError } from "@server/errors";
import type { Database } from "@server/models";
import env from "../env";
import type { DatabaseTablesDuplicator } from "./DatabaseTablesDuplicator";
import { TeableClient } from "./teable/TeableClient";
import { TeableIdentity } from "./teable/TeableIdentity";
import { TeableTablesDuplicator } from "./teable/TeableTablesDuplicator";

/**
 * Returns what duplicates the engine tables of a database.
 *
 * @param database the database, whose `engine` column names its engine.
 * @returns the duplicator.
 * @throws InternalError when the engine is unknown or not configured.
 */
export function tablesDuplicatorFor(
  database: Pick<Database, "engine">
): DatabaseTablesDuplicator {
  return factory(database);
}

/**
 * Replaces how duplicators are built, for tests.
 *
 * @param next the factory to use, or undefined to restore the default one.
 */
export function setTablesDuplicatorFactory(
  next?: DatabaseTablesDuplicatorFactory
) {
  factory = next ?? defaultFactory;
}

export type DatabaseTablesDuplicatorFactory = (
  database: Pick<Database, "engine">
) => DatabaseTablesDuplicator;

const defaultFactory: DatabaseTablesDuplicatorFactory = (database) => {
  if (database.engine !== "teable") {
    throw InternalError(`Unknown database engine "${database.engine}"`);
  }
  if (!env.TEABLE_INTERNAL_URL || !env.GALADRIM_SECRET) {
    throw InternalError("Databases are not configured on this server");
  }
  // "outline": the server's own writes, which the webhook does not echo back.
  return new TeableTablesDuplicator(
    new TeableClient(env.TEABLE_INTERNAL_URL, "outline"),
    new TeableIdentity(
      new TeableClient(env.TEABLE_INTERNAL_URL),
      env.GALADRIM_SECRET,
      env.TEABLE_SPACE_ID
    )
  );
};

let factory: DatabaseTablesDuplicatorFactory = defaultFactory;

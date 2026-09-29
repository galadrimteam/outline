import { InternalError } from "@server/errors";
import type { Database } from "@server/models";
import env from "../env";
import { publishDatabaseChange } from "../utils/DatabaseChangePublisher";
import type { DatabaseEngine, DatabaseRef } from "./DatabaseEngine";
import { OutlineAttachmentStorage } from "./outline/attachments";
import { OutlineEngine } from "./outline/OutlineEngine";
import {
  processComputedBases,
  processOutlineStore,
} from "./outline/processCaches";
import { outlineQuery } from "./outline/query";
import { OutlineUserDirectory } from "./outline/OutlineUserDirectory";
import { TeableClient } from "./teable/TeableClient";
import { TeableEngine } from "./teable/TeableEngine";
import { TeableIdentity } from "./teable/TeableIdentity";
import { TeableMapper } from "./teable/TeableMapper";

/**
 * Returns the engine that stores a database's data.
 *
 * @param database the database, whose `engine` column names its engine; the
 * Outline engine also needs its `teamId` to create tables and resolve people.
 * @param options.origin a tag echoed by the engine's change notifications, so
 * that the writer can recognise its own changes; "app" when not given, and
 * "outline" for the server's own writes (they are not synced back).
 * @returns the engine.
 * @throws InternalError when the engine is unknown or not configured.
 */
export function engineFor(
  database: DatabaseEngineTarget,
  options: DatabaseEngineOptions = {}
): DatabaseEngine {
  return factory(database, options);
}

/**
 * Returns where a database's data lives in its engine.
 *
 * @param database the database.
 * @returns the engine base and table ids.
 */
export function refFor(
  database: Pick<Database, "externalBaseId" | "externalTableId">
): DatabaseRef {
  return {
    externalBaseId: database.externalBaseId,
    externalTableId: database.externalTableId,
  };
}

/**
 * Replaces how engines are built, for tests.
 *
 * @param next the factory to use, or undefined to restore the default one.
 */
export function setEngineFactory(next?: DatabaseEngineFactory) {
  factory = next ?? defaultFactory;
}

/** What an engine is chosen by: the database's engine, and its team for the Outline engine. */
export type DatabaseEngineTarget = Pick<Database, "engine"> &
  Partial<Pick<Database, "teamId">>;

export interface DatabaseEngineOptions {
  origin?: string | null;
}

export type DatabaseEngineFactory = (
  database: DatabaseEngineTarget,
  options: DatabaseEngineOptions
) => DatabaseEngine;

const defaultFactory: DatabaseEngineFactory = (database, options) => {
  if (database.engine === "outline") {
    return new OutlineEngine({
      store: processOutlineStore(),
      query: outlineQuery,
      users: new OutlineUserDirectory(),
      attachments: new OutlineAttachmentStorage(),
      publish: publishDatabaseChange,
      computedBases: processComputedBases(),
      teamId: database.teamId,
      origin: options.origin ?? "app",
    });
  }
  if (database.engine !== "teable") {
    throw InternalError(`Unknown database engine "${database.engine}"`);
  }
  if (!env.TEABLE_INTERNAL_URL || !env.GALADRIM_SECRET) {
    throw InternalError("Databases are not configured on this server");
  }
  const identity = new TeableIdentity(
    new TeableClient(env.TEABLE_INTERNAL_URL),
    env.GALADRIM_SECRET,
    env.TEABLE_SPACE_ID
  );
  return new TeableEngine(
    new TeableClient(env.TEABLE_INTERNAL_URL, options.origin ?? "app"),
    identity,
    new TeableMapper(env.TEABLE_PUBLIC_URL)
  );
};

let factory: DatabaseEngineFactory = defaultFactory;

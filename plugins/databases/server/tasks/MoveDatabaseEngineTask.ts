import { InternalError } from "@server/errors";
import Logger from "@server/logging/Logger";
import { Database, User } from "@server/models";
import { BaseTask, TaskPriority } from "@server/queues/tasks/base/BaseTask";
import type { DatabaseEngineMoveResult } from "../commands/databaseEngineMover";
import { DatabaseEngineMover } from "../commands/databaseEngineMover";
import { processOutlineStore } from "../engine/outline/processCaches";
import { OutlineUserDirectory } from "../engine/outline/OutlineUserDirectory";
import { TeableBaseReader } from "../engine/teable/TeableBaseReader";
import { TeableClient } from "../engine/teable/TeableClient";
import { TeableIdentity } from "../engine/teable/TeableIdentity";
import { TeableMapper } from "../engine/teable/TeableMapper";
import env from "../env";
import { OutlineAttachmentFileStore } from "../utils/DatabaseFileStore";

/** Props of {@link MoveDatabaseEngineTask}. */
export interface MoveDatabaseEngineProps {
  /** A database of the Teable base to move. */
  databaseId: string;
  /** The admin running the move, who owns the copied files. */
  actorId: string;
  /** Counts what would move without writing anything. */
  dryRun: boolean;
}

/**
 * Moves the Teable base of a database into the Outline engine (see
 * {@link DatabaseEngineMover}). A task, because reading every table, every
 * view's order and every file of a base outlasts a request.
 */
export class MoveDatabaseEngineTask extends BaseTask<MoveDatabaseEngineProps> {
  public async perform({
    databaseId,
    actorId,
    dryRun,
  }: MoveDatabaseEngineProps): Promise<DatabaseEngineMoveResult> {
    const [database, user] = await Promise.all([
      Database.findByPk(databaseId, { rejectOnEmpty: true }),
      User.findByPk(actorId, { rejectOnEmpty: true }),
    ]);
    const result = await moverFactory(user).move({ database, dryRun });
    if (!dryRun) {
      Logger.info("task", "Moved databases to the Outline engine", {
        databaseId,
        result,
      });
    }
    return result;
  }

  public get options() {
    // A failed move removes what it wrote; running it again is the admin's call.
    return { priority: TaskPriority.Normal, attempts: 1 };
  }
}

/**
 * Replaces how movers are built, for tests.
 *
 * @param next the factory to use, or undefined to restore the default one.
 */
export function setDatabaseEngineMoverFactory(
  next?: DatabaseEngineMoverFactory
) {
  moverFactory = next ?? defaultFactory;
}

export type DatabaseEngineMoverFactory = (user: User) => DatabaseEngineMover;

const defaultFactory: DatabaseEngineMoverFactory = (user) => {
  if (!env.TEABLE_INTERNAL_URL || !env.GALADRIM_SECRET) {
    throw InternalError("Teable is not configured on this server");
  }
  return new DatabaseEngineMover({
    source: new TeableBaseReader(
      new TeableClient(env.TEABLE_INTERNAL_URL),
      new TeableIdentity(
        new TeableClient(env.TEABLE_INTERNAL_URL),
        env.GALADRIM_SECRET,
        env.TEABLE_SPACE_ID
      ),
      env.TEABLE_INTERNAL_URL,
      env.TEABLE_PUBLIC_URL
    ),
    store: processOutlineStore(),
    files: new OutlineAttachmentFileStore(user),
    users: new OutlineUserDirectory(),
    mapper: new TeableMapper(env.TEABLE_PUBLIC_URL),
  });
};

let moverFactory: DatabaseEngineMoverFactory = defaultFactory;

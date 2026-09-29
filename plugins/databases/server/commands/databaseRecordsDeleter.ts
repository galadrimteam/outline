import type { DatabaseCommandContext } from "@server/commands/databaseRowDocumentCreator";
import {
  inTransaction,
  resolveContext,
} from "@server/commands/databaseRowDocumentCreator";
import { createContext } from "@server/context";
import { AuthorizationError } from "@server/errors";
import type { Database } from "@server/models";
import { Document } from "@server/models";
import { authorize } from "@server/policies";
import type { DatabaseEngine } from "../engine/DatabaseEngine";
import { refFor } from "../engine";
import { actorFor } from "../utils/actor";

interface RecordsDeleterProps {
  /** The database the rows belong to, which the user may update. */
  database: Database;
  /** The engine of the database. */
  engine: DatabaseEngine;
  /** The rows to delete. */
  recordIds: string[];
}

/**
 * Deletes database rows and sends their pages to the trash, as Notion does: a
 * row and its page are one thing. The pages are checked before anything
 * changes, so one the user may not delete refuses the whole deletion, and
 * they go back where they were when the engine refuses the rows.
 *
 * @param ctx the request context, or the acting user with an optional transaction.
 * @param props the database, its engine and the rows.
 * @throws AuthorizationError when the user may not delete one of the pages.
 */
export async function databaseRecordsDeleter(
  ctx: DatabaseCommandContext,
  { database, engine, recordIds }: RecordsDeleterProps
): Promise<void> {
  const { user, transaction, ip } = resolveContext(ctx);

  await inTransaction(transaction, async (t) => {
    const linked = await Document.unscoped().findAll({
      attributes: ["id"],
      where: { databaseId: database.id, databaseRecordId: recordIds },
      transaction: t,
    });
    const pages = linked.length
      ? await Document.findByIds(
          linked.map((page) => page.id),
          { userId: user.id, transaction: t }
        )
      : [];
    if (pages.length !== linked.length) {
      throw AuthorizationError("A page of these rows is not yours to delete");
    }
    pages.forEach((page) => authorize(user, "delete", page));

    const context = createContext({ user, transaction: t, ip });
    for (const page of pages) {
      await page.destroyWithCtx(context);
    }
    await engine.deleteRecords(actorFor(user), refFor(database), recordIds);
  });
}

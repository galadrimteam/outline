import { uniq } from "es-toolkit/compat";
import type { DatabaseChangeKind } from "@shared/databases/types";
import { Database, Event, User } from "@server/models";
import type { DatabaseCellChange } from "@server/types";

/** Above this many rows, readers reload the whole view instead. */
const maxRecordIds = 500;

/** Before/after values forwarded, for the row title sync and automations. */
const maxChanges = 500;

/** A change of an engine table, told by whichever engine made it. */
export interface DatabaseChange {
  tableId: string;
  kinds: DatabaseChangeKind[];
  recordIds?: string[];
  fieldIds?: string[];
  viewIds?: string[];
  changes?: DatabaseCellChange[];
  /** Who made it: an Outline user, or an email matched in each team. */
  actor?: { outlineUserId?: string | null; email?: string | null } | null;
  /** Echoed to readers so that a writer can recognise its own changes. */
  origin?: string | null;
}

/**
 * Sends `databases.change` to the readers of every Outline database showing
 * the table (a table may back several, or none when only linked to).
 *
 * @param change what changed.
 */
export async function publishDatabaseChange(change: DatabaseChange) {
  const databases = await Database.findAll({
    where: { externalTableId: change.tableId },
  });
  if (!databases.length) {
    return;
  }

  const recordIds = uniq(change.recordIds ?? []);
  const data = {
    kinds: uniq(change.kinds),
    recordIds: recordIds.length <= maxRecordIds ? recordIds : undefined,
    fieldIds: uniq(change.fieldIds ?? []),
    viewIds: uniq(change.viewIds ?? []),
    origin: change.origin ?? null,
    changes: (change.changes ?? []).slice(0, maxChanges),
  };

  const actorIdByTeam = await actorsByTeam(
    change.actor,
    uniq(databases.map((database) => database.teamId))
  );

  await Promise.all(
    databases.map((database) =>
      Event.schedule({
        name: "databases.change",
        modelId: database.id,
        teamId: database.teamId,
        actorId: actorIdByTeam.get(database.teamId) ?? "",
        collectionId: database.collectionId,
        documentId: database.documentId,
        data,
      })
    )
  );
}

async function actorsByTeam(
  actor: DatabaseChange["actor"],
  teamIds: string[]
): Promise<Map<string, string>> {
  if (actor?.outlineUserId) {
    const user = await User.findByPk(actor.outlineUserId, {
      attributes: ["id", "teamId"],
    });
    return new Map(user ? [[user.teamId, user.id]] : []);
  }
  if (!actor?.email) {
    return new Map();
  }
  const users = await User.findAll({
    attributes: ["id", "teamId"],
    where: { email: actor.email.toLowerCase(), teamId: teamIds },
  });
  return new Map(users.map((user) => [user.teamId, user.id]));
}

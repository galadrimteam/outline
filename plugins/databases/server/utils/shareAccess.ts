import isUUID from "validator/lib/isUUID";
import type {
  DatabaseCellValue,
  DatabaseGroupPoint,
  DatabaseRecord,
  DatabaseUserValue,
} from "@shared/databases/types";
import { loadPublicShare } from "@server/commands/shareLoader";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@server/errors";
import { Database, User } from "@server/models";
import { can } from "@server/policies";
import type { APIContext } from "@server/types";
import { getTeamFromContext } from "@server/utils/passport";
import type { DatabaseActor } from "../engine/DatabaseEngine";
import { actorFor } from "./actor";

/** How a request is allowed to read a database. */
export interface DatabaseReadAccess {
  /** The database, with its anchor loaded for the signed-in user. */
  database: Database;
  /** The signed-in user, null for an anonymous reader. */
  user: User | null;
  /** Who the engine records the reads for. */
  actor: DatabaseActor;
  /** The share that allowed the read, null when the user's own rights did. */
  shareId: string | null;
}

/**
 * Loads a database for a read route and checks that the request may read it,
 * see `authorizeDatabaseRead`.
 *
 * @param ctx the request context, signed in or not.
 * @param id the database id.
 * @param shareId the share the page holding the database is read through.
 * @returns how the request reads the database.
 * @throws NotFoundError when the database does not exist.
 * @throws AuthenticationError when nobody is signed in and no share is given.
 * @throws AuthorizationError when neither the user nor the share gives access.
 */
export async function loadDatabaseForRead(
  ctx: APIContext,
  id: string,
  shareId?: string | null
): Promise<DatabaseReadAccess> {
  const user = signedInUser(ctx);
  const database = await Database.findByPkForUser(id, user?.id);
  if (!database) {
    throw NotFoundError("Database not found");
  }
  return authorizeDatabaseRead(ctx, database, shareId);
}

/**
 * Checks that a request may read a database: a user with `read` on it, or
 * anyone reading through a published share that covers its anchor (the
 * anchor document, or the collection for a database without one). A share
 * only ever gives read access: write routes keep requiring a user with
 * `update`.
 *
 * @param ctx the request context, signed in or not.
 * @param database the database, its anchor loaded for the signed-in user.
 * @param shareId the share the page holding the database is read through.
 * @returns how the request reads the database.
 * @throws AuthenticationError when nobody is signed in and no share is given.
 * @throws AuthorizationError when neither the user nor the share gives access.
 */
export async function authorizeDatabaseRead(
  ctx: APIContext,
  database: Database,
  shareId?: string | null
): Promise<DatabaseReadAccess> {
  const user = signedInUser(ctx);
  if (user && can(user, "read", database)) {
    return { database, user, actor: actorFor(user), shareId: null };
  }
  if (!shareId) {
    if (!user) {
      throw AuthenticationError("Authentication required");
    }
    throw AuthorizationError();
  }

  const teamId =
    user?.teamId ??
    (isUUID(shareId)
      ? undefined
      : (await getTeamFromContext(ctx, { includeOAuthState: false }))?.id);
  const { share } = await loadPublicShare({
    id: shareId,
    teamId,
    ...(database.documentId
      ? { documentId: database.documentId }
      : { collectionId: database.collectionId }),
  });
  if (share.teamId !== database.teamId) {
    throw AuthorizationError();
  }

  // The service account reads for share readers, so that a person without
  // rights on the database never gets an engine account through a share.
  return { database, user, actor: "system", shareId: share.id };
}

/**
 * Returns the user a row page opened through a share is created as. Nobody
 * signed in may author it, so the database's creator does, as the migration
 * or the person who made the database would have.
 *
 * @param access how the request reads the database.
 * @returns the author of the row page.
 * @throws NotFoundError when the database has no creator left.
 */
export async function rowPageAuthorFor(
  access: DatabaseReadAccess
): Promise<User> {
  if (access.user && !access.shareId) {
    return access.user;
  }
  const creatorId =
    access.database.createdById ?? access.database.document?.createdById;
  const author = creatorId
    ? await User.findOne({
        where: { id: creatorId, teamId: access.database.teamId },
      })
    : null;
  if (!author) {
    throw NotFoundError("This row has no page yet");
  }
  return author;
}

/**
 * Removes from records what a share reader must not see: the email of the
 * people in person cells. Records read with the user's own rights are
 * returned as they are.
 *
 * @param access how the request reads the database.
 * @param records the records, ready for the API.
 * @returns the records to send.
 */
export function redactRecordsForShare(
  access: DatabaseReadAccess,
  records: DatabaseRecord[]
): DatabaseRecord[] {
  if (!access.shareId) {
    return records;
  }
  return records.map((record) => {
    const fields: Record<string, DatabaseCellValue> = {};
    for (const [fieldId, value] of Object.entries(record.fields)) {
      fields[fieldId] = redactCell(value);
    }
    return { ...record, fields };
  });
}

/**
 * Removes the email of the people heading groups from what a share reader
 * gets, see `redactRecordsForShare`.
 *
 * @param access how the request reads the database.
 * @param points the group points.
 * @returns the group points to send.
 */
export function redactGroupPointsForShare(
  access: DatabaseReadAccess,
  points: DatabaseGroupPoint[]
): DatabaseGroupPoint[] {
  if (!access.shareId) {
    return points;
  }
  return points.map((point) =>
    point.type === "header"
      ? { ...point, value: redactCell(point.value) }
      : point
  );
}

function signedInUser(ctx: APIContext): User | null {
  return ctx.state.auth?.user ?? null;
}

function redactCell(value: DatabaseCellValue): DatabaseCellValue {
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.every(isUserValue) ? items.map(withoutEmail) : value;
  }
  return isUserValue(value) ? withoutEmail(value) : value;
}

function withoutEmail({
  email: _email,
  ...person
}: DatabaseUserValue): DatabaseUserValue {
  return person;
}

function isUserValue(value: unknown): value is DatabaseUserValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    "email" in value
  );
}

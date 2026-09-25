import type { User } from "@server/models";
import type { DatabaseUserActor } from "../engine/DatabaseEngine";

/**
 * Returns the engine identity of an Outline user.
 *
 * @param user the user.
 * @returns the actor the engine records.
 */
export function actorFor(user: User): DatabaseUserActor {
  return {
    email: engineEmailFor(user),
    name: user.name,
    outlineUserId: user.id,
  };
}

/**
 * Returns the email an Outline user is known by in the engine. Users without
 * an email get a stable address that no mailbox answers.
 *
 * @param user the user.
 * @returns the email, lower-cased.
 */
export function engineEmailFor(user: Pick<User, "id" | "email">): string {
  return (user.email ?? `${user.id}@users.outline.invalid`).toLowerCase();
}

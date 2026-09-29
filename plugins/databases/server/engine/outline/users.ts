import type { DatabaseUserValue } from "@shared/databases/types";
import type { DatabaseActor, DatabaseEngineUserInput } from "../DatabaseEngine";

/**
 * The people of the Outline engine. An engine user id is the Outline user id
 * of a member of the team, or `email:<lower-cased address>` for a person who
 * is none (kept from Notion or Teable, or not invited yet).
 */
export interface EngineUserDirectory {
  /**
   * Returns the engine user id of each person.
   *
   * @param teamId the team of the database.
   * @param users the people, by email.
   * @returns the engine user id of each lower-cased email.
   */
  ensureUsers(
    teamId: string,
    users: DatabaseEngineUserInput[]
  ): Promise<Map<string, string>>;

  /**
   * Returns the person value of engine user ids, for the cells that show who
   * created or edited a record and for history entries.
   *
   * @param teamId the team of the database.
   * @param ids the engine user ids.
   * @returns the person value of each id that names someone.
   */
  describe(
    teamId: string,
    ids: string[]
  ): Promise<Map<string, DatabaseUserValue>>;
}

/** The prefix of the engine user id of a person who is no Outline user. */
export const emailUserIdPrefix = "email:";

/**
 * Returns the engine user id of an actor.
 *
 * @param actor the actor.
 * @returns the Outline user id, or null for Outline itself.
 */
export function engineUserId(actor: DatabaseActor): string | null {
  return actor === "system" ? null : actor.outlineUserId;
}

/**
 * Returns the engine user id of a person who is not an Outline user.
 *
 * @param email the person's email.
 * @returns the engine user id.
 */
export function emailUserId(email: string): string {
  return `${emailUserIdPrefix}${email.trim().toLowerCase()}`;
}

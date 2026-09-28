import { Op } from "sequelize";
import isUUID from "validator/lib/isUUID";
import type { DatabaseUserValue } from "@shared/databases/types";
import { User } from "@server/models";
import { engineEmailFor } from "../../utils/actor";
import type { DatabaseEngineUserInput } from "../DatabaseEngine";
import type { EngineUserDirectory } from "./users";
import { emailUserId, emailUserIdPrefix } from "./users";

/** The Outline engine's people, read from Outline's users. */
export class OutlineUserDirectory implements EngineUserDirectory {
  async ensureUsers(
    teamId: string,
    users: DatabaseEngineUserInput[]
  ): Promise<Map<string, string>> {
    const emails = [...new Set(users.map((user) => user.email.toLowerCase()))];
    const result = new Map<string, string>();
    if (!emails.length) {
      return result;
    }
    const members = await User.findAll({
      attributes: ["id", "email"],
      where: { teamId, email: { [Op.in]: emails } },
    });
    const idByEmail = new Map(
      members.map((member) => [engineEmailFor(member), member.id])
    );
    const outsiders = emails.filter((email) => !idByEmail.has(email));
    // Users without an email are known by a placeholder address holding their id.
    const placeholders = outsiders.flatMap((email) => {
      const match = email.match(/^([0-9a-f-]{36})@users\.outline\.invalid$/);
      return match && isUUID(match[1]) ? [match[1]] : [];
    });
    if (placeholders.length) {
      const placeheld = await User.findAll({
        attributes: ["id", "email"],
        where: { teamId, id: placeholders },
      });
      for (const member of placeheld) {
        idByEmail.set(engineEmailFor(member), member.id);
      }
    }
    for (const email of emails) {
      result.set(email, idByEmail.get(email) ?? emailUserId(email));
    }
    return result;
  }

  async describe(
    teamId: string,
    ids: string[]
  ): Promise<Map<string, DatabaseUserValue>> {
    const result = new Map<string, DatabaseUserValue>();
    const unique = [...new Set(ids)];
    const userIds = unique.filter((id) => isUUID(id));
    if (userIds.length) {
      const users = await User.findAll({
        attributes: ["id", "name", "email"],
        where: { teamId, id: userIds },
        paranoid: false,
      });
      for (const user of users) {
        result.set(user.id, {
          id: user.id,
          title: user.name,
          email: engineEmailFor(user),
        });
      }
    }
    for (const id of unique) {
      if (id.startsWith(emailUserIdPrefix)) {
        const email = id.slice(emailUserIdPrefix.length);
        result.set(id, { id, title: email, email });
      }
    }
    return result;
  }
}

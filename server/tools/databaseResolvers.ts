import { Op } from "sequelize";
import type { WhereOptions } from "sequelize";
import isUUID from "validator/lib/isUUID";
import type { DatabaseField } from "@shared/databases/types";
import { ValidationError } from "@server/errors";
import { User } from "@server/models";
import { QueryHelper } from "@server/storage/QueryHelper";
import type {
  DatabaseActor,
  DatabaseEngine,
  DatabaseRef,
} from "plugins/databases/server/engine/DatabaseEngine";
import { engineEmailFor } from "plugins/databases/server/utils/actor";
import type {
  DatabaseLinkResolver,
  DatabasePeopleResolver,
} from "./databaseInputs";
import { isMe, sameName } from "./databaseInputs";

/**
 * Finds people among the members of the acting user's team, by e-mail, name,
 * Outline id, or "me", and makes sure the engine knows them.
 */
export class TeamPeopleResolver implements DatabasePeopleResolver {
  /**
   * @param user the acting user, whose team is searched and who "me" is.
   * @param engine the engine of the database.
   */
  constructor(
    private readonly user: User,
    private readonly engine: DatabaseEngine
  ) {}

  public async outlineUserIds(refs: string[]): Promise<string[]> {
    const users = await this.find(refs);
    return users.map((user) => user.id);
  }

  public async engineUserIds(refs: string[]): Promise<string[]> {
    const users = await this.find(refs);
    if (!users.length) {
      return [];
    }
    const idByEmail = await this.engine.ensureUsers(
      users.map((user) => ({ email: engineEmailFor(user), name: user.name }))
    );
    return users.map((user) => {
      const id = idByEmail.get(engineEmailFor(user));
      if (!id) {
        throw ValidationError(
          `${user.name} could not be found in the database`
        );
      }
      return id;
    });
  }

  private async find(refs: string[]): Promise<User[]> {
    const parsed = refs.map(parseRef);
    const where: WhereOptions<User>[] = [];
    for (const ref of parsed) {
      if (ref.kind === "id") {
        where.push({ id: ref.value });
      } else if (ref.kind === "email") {
        where.push({
          email: { [Op.iLike]: QueryHelper.escapeLike(ref.value) },
        });
      } else if (ref.kind === "name") {
        where.push({ name: { [Op.iLike]: QueryHelper.escapeLike(ref.value) } });
      }
    }
    const candidates = where.length
      ? await User.findAll({
          where: { teamId: this.user.teamId, [Op.or]: where },
        })
      : [];

    return parsed.map((ref) => {
      if (ref.kind === "me") {
        return this.user;
      }
      const matches = candidates.filter((user) =>
        ref.kind === "id"
          ? user.id === ref.value
          : ref.kind === "email"
            ? user.email?.toLowerCase() === ref.value.toLowerCase()
            : sameName(user.name, ref.value)
      );
      if (!matches.length) {
        throw ValidationError(
          `No member of the workspace matches "${ref.value}": use an e-mail address`
        );
      }
      if (matches.length > 1) {
        throw ValidationError(
          `Several members are named "${ref.value}": use an e-mail address`
        );
      }
      return matches[0];
    });
  }
}

/**
 * Finds rows of the database a relation property links to, by id or by title,
 * as the engine's link candidates.
 */
export class EngineLinkResolver implements DatabaseLinkResolver {
  /**
   * @param engine the engine of the database holding the relation.
   * @param actor the person the lookups are made for.
   * @param ref the engine table holding the relation.
   */
  constructor(
    private readonly engine: DatabaseEngine,
    private readonly actor: DatabaseActor,
    private readonly ref: DatabaseRef
  ) {}

  public async recordIds(
    field: DatabaseField,
    refs: string[]
  ): Promise<string[]> {
    return Promise.all(
      refs.map(async (value) => {
        if (recordId.test(value)) {
          return value;
        }
        const candidates = await this.engine.linkCandidates(
          this.actor,
          this.ref,
          { fieldId: field.id, search: value, skip: 0, take: 50 }
        );
        const matches = candidates.filter((candidate) =>
          sameName(candidate.title, value)
        );
        if (!matches.length) {
          throw ValidationError(
            `No row titled "${value}" can be linked by "${field.name}"`
          );
        }
        if (matches.length > 1) {
          throw ValidationError(
            `Several rows linked by "${field.name}" are titled "${value}": use one of the ids ${matches
              .map((match) => match.id)
              .join(", ")}`
          );
        }
        return matches[0].id;
      })
    );
  }
}

/** A Teable record id: "rec" and 16 letters or digits. */
const recordId = /^rec[A-Za-z0-9]{16}$/;

interface PersonRef {
  kind: "me" | "id" | "email" | "name";
  value: string;
}

function parseRef(input: string): PersonRef {
  const value = input.trim();
  if (isMe(value)) {
    return { kind: "me", value };
  }
  if (isUUID(value)) {
    return { kind: "id", value };
  }
  const email = value.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1];
  if (email) {
    return { kind: "email", value: email };
  }
  if (/^[^\s@]+@[^\s@]+$/.test(value)) {
    return { kind: "email", value };
  }
  return { kind: "name", value };
}

import { Op } from "sequelize";
import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseRecord,
  DatabaseUserInput,
  DatabaseUserValue,
} from "@shared/databases/types";
import { ValidationError } from "@server/errors";
import { User } from "@server/models";
import type { DatabaseEngine } from "../engine/DatabaseEngine";
import { engineEmailFor } from "./actor";

/**
 * Translates people between Outline and the engine: the app writes Outline
 * user ids, the engine stores its own users, and readers get both.
 */
export class DatabaseUserMapper {
  /**
   * Replaces the Outline users written into person cells by the engine users,
   * creating them in the engine when needed. Only users of the team count.
   *
   * @param engine the engine of the database.
   * @param teamId the team of the database.
   * @param fields the cells to write, keyed by field id.
   * @returns the cells ready for the engine.
   * @throws ValidationError when a user is not a member of the team.
   */
  public static async resolveInputs(
    engine: DatabaseEngine,
    teamId: string,
    fields: Record<string, DatabaseCellInput>
  ): Promise<Record<string, DatabaseCellValue>> {
    const outlineUserIds = new Set<string>();
    for (const value of Object.values(fields)) {
      if (isUserInput(value)) {
        outlineUserIds.add(value.outlineUserId);
      } else if (isUserInputList(value)) {
        value.forEach((input) => outlineUserIds.add(input.outlineUserId));
      }
    }

    const valueByOutlineId = new Map<string, DatabaseUserValue>();
    if (outlineUserIds.size) {
      const users = await User.findAll({
        where: { id: [...outlineUserIds], teamId },
      });
      if (users.length !== outlineUserIds.size) {
        throw ValidationError("A person cell refers to an unknown user");
      }
      const engineIds = await engine.ensureUsers(
        users.map((user) => ({ email: engineEmailFor(user), name: user.name }))
      );
      for (const user of users) {
        const email = engineEmailFor(user);
        const engineId = engineIds.get(email);
        if (!engineId) {
          throw ValidationError("A person could not be added to the database");
        }
        valueByOutlineId.set(user.id, {
          id: engineId,
          title: user.name,
          email,
          outlineUserId: user.id,
        });
      }
    }

    const toValue = (input: DatabaseUserInput): DatabaseUserValue => {
      const value = valueByOutlineId.get(input.outlineUserId);
      if (!value) {
        throw ValidationError("A person cell refers to an unknown user");
      }
      return value;
    };

    const result: Record<string, DatabaseCellValue> = {};
    for (const [fieldId, value] of Object.entries(fields)) {
      if (isUserInput(value)) {
        result[fieldId] = toValue(value);
      } else if (isUserInputList(value)) {
        result[fieldId] = value.map(toValue);
      } else {
        result[fieldId] = value;
      }
    }
    return result;
  }

  /**
   * Fills `outlineUserId` in the person values of records, matching the
   * engine users to the team's members by email, in one query.
   *
   * @param teamId the team of the database.
   * @param records the records, changed in place.
   */
  public static async enrich(
    teamId: string,
    records: DatabaseRecord[]
  ): Promise<void> {
    const values = records.flatMap((record) =>
      Object.values(record.fields).flatMap((value) => this.userValuesIn(value))
    );
    await this.enrichValues(teamId, values);
  }

  /**
   * Returns the person values held by a cell value.
   *
   * @param value the cell value.
   * @returns the person values, the same objects.
   */
  public static userValuesIn(
    value: DatabaseCellValue | undefined
  ): DatabaseUserValue[] {
    if (value === null || value === undefined || typeof value !== "object") {
      return [];
    }
    const items: unknown[] = Array.isArray(value) ? value : [value];
    return items.filter(isUserValue);
  }

  /**
   * Fills `outlineUserId` in person values, in one query.
   *
   * @param teamId the team of the database.
   * @param values the person values, changed in place.
   */
  public static async enrichValues(
    teamId: string,
    values: DatabaseUserValue[]
  ): Promise<void> {
    const emails = [
      ...new Set(
        values.flatMap((value) =>
          value.email ? [value.email.toLowerCase()] : []
        )
      ),
    ];
    if (!emails.length) {
      return;
    }
    const users = await User.findAll({
      attributes: ["id", "email"],
      where: { teamId, email: { [Op.in]: emails } },
    });
    const idByEmail = new Map(
      users.map((user) => [user.email?.toLowerCase(), user.id])
    );
    for (const value of values) {
      value.outlineUserId = value.email
        ? (idByEmail.get(value.email.toLowerCase()) ?? null)
        : null;
    }
  }
}

function isUserInput(
  value: DatabaseCellInput | undefined
): value is DatabaseUserInput {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "outlineUserId" in value &&
    !("id" in value)
  );
}

function isUserInputList(
  value: DatabaseCellInput | undefined
): value is DatabaseUserInput[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "object" && isUserInput(item))
  );
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

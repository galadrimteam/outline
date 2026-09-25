import { Op } from "sequelize";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseRecord,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { User } from "@server/models";
import type { DatabaseCellChange } from "@server/types";
import { DatabaseUserMapper } from "./DatabaseUserMapper";

/**
 * Tells whether people can be added to a field by hand, as opposed to the
 * people a row was created or edited by, or looked up from another table.
 *
 * @param field the field.
 * @returns true for a person field.
 */
export function isPersonField(field: DatabaseField): boolean {
  return (
    field.type === DatabaseFieldType.User &&
    !field.isLookup &&
    !field.isComputed
  );
}

/**
 * Returns, per row, the people a batch of cell changes added to person
 * fields: those in the last value of a cell that were not in its first, so
 * that someone added then removed in the same batch is not counted.
 *
 * @param changes the cell changes, oldest first.
 * @param fieldIds the person fields.
 * @returns the people added, keyed by record id.
 */
export function addedPeople(
  changes: DatabaseCellChange[],
  fieldIds: ReadonlySet<string>
): Map<string, DatabaseUserValue[]> {
  const cells = new Map<
    string,
    { recordId: string; before: DatabaseCellValue; after: DatabaseCellValue }
  >();
  for (const change of changes) {
    if (!fieldIds.has(change.fieldId)) {
      continue;
    }
    const key = `${change.recordId}:${change.fieldId}`;
    const cell = cells.get(key);
    if (cell) {
      cell.after = change.after;
    } else {
      cells.set(key, {
        recordId: change.recordId,
        before: change.before,
        after: change.after,
      });
    }
  }

  const result = new Map<string, DatabaseUserValue[]>();
  for (const cell of cells.values()) {
    const before = new Set(
      DatabaseUserMapper.userValuesIn(cell.before).map((person) => person.id)
    );
    const added = DatabaseUserMapper.userValuesIn(cell.after).filter(
      (person) => !before.has(person.id)
    );
    if (added.length) {
      result.set(
        cell.recordId,
        uniquePeople([...(result.get(cell.recordId) ?? []), ...added])
      );
    }
  }
  return result;
}

/**
 * Returns the people in the person fields of a row.
 *
 * @param record the row.
 * @param fieldIds the person fields.
 * @returns the people, each once.
 */
export function peopleIn(
  record: DatabaseRecord,
  fieldIds: ReadonlySet<string>
): DatabaseUserValue[] {
  return uniquePeople(
    [...fieldIds].flatMap((fieldId) =>
      DatabaseUserMapper.userValuesIn(record.fields[fieldId])
    )
  );
}

/**
 * Finds the members of a team behind engine people, by email. People without
 * an email in Outline are known to the engine by a placeholder address that
 * carries their id.
 *
 * @param teamId the team.
 * @param people the engine people.
 * @returns the Outline user of each engine person id, when there is one.
 */
export async function outlineUsersOf(
  teamId: string,
  people: DatabaseUserValue[]
): Promise<Map<string, User>> {
  const emails = new Set<string>();
  const ids = new Set<string>();
  for (const person of people) {
    const email = person.email?.toLowerCase();
    if (!email) {
      continue;
    }
    const placeholder = placeholderUserId(email);
    if (placeholder) {
      ids.add(placeholder);
    } else {
      emails.add(email);
    }
  }
  if (!emails.size && !ids.size) {
    return new Map();
  }

  const users = await User.findAll({
    where: {
      teamId,
      [Op.or]: [{ email: { [Op.in]: [...emails] } }, { id: [...ids] }],
    },
  });
  const byEmail = new Map(
    users.map((user) => [user.email?.toLowerCase(), user])
  );
  const byId = new Map(users.map((user) => [user.id, user]));

  const result = new Map<string, User>();
  for (const person of people) {
    const email = person.email?.toLowerCase();
    if (!email) {
      continue;
    }
    const placeholder = placeholderUserId(email);
    const user = placeholder ? byId.get(placeholder) : byEmail.get(email);
    if (user) {
      result.set(person.id, user);
    }
  }
  return result;
}

/** The address `engineEmailFor` gives to users without an email. */
const placeholderEmail =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@users\.outline\.invalid$/;

function placeholderUserId(email: string): string | undefined {
  return placeholderEmail.exec(email)?.[1];
}

function uniquePeople(people: DatabaseUserValue[]): DatabaseUserValue[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.id)) {
      return false;
    }
    seen.add(person.id);
    return true;
  });
}

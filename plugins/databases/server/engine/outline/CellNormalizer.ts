import { uniq } from "es-toolkit/compat";
import type {
  DatabaseCellValue,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { toError } from "@shared/utils/error";
import { ValidationError } from "@server/errors";
import type { DatabaseActor } from "../DatabaseEngine";
import { isEmptyCell, personValues } from "./cells";
import { isLinkField } from "./links";
import type { OutlineQuery } from "./query/contract";
import { isReadOnlyField, toDatabaseField } from "./schema";
import type { EngineFieldRow, TableSnapshot } from "./types";
import type { EngineUserDirectory } from "./users";

/**
 * Turns the cells a write is given into the cells the engine stores: known,
 * writable fields only, each value normalized for its field by the query
 * functions, people as `{id, title, email}` (named from the directory when
 * written by id only); and gives new records their fields' default values.
 */
export class CellNormalizer {
  /**
   * @param query normalizes values for their field.
   * @param users names the people written by id.
   */
  constructor(
    private readonly query: OutlineQuery,
    private readonly users: EngineUserDirectory
  ) {}

  /**
   * Checks and normalizes the cells of a write.
   *
   * @param table the table written.
   * @param input the cells, keyed by field id.
   * @returns the cells ready to store.
   * @throws ValidationError when a field is unknown or computed, or a value
   * does not fit its field.
   */
  public async normalize(
    table: TableSnapshot,
    input: Record<string, DatabaseCellValue>
  ): Promise<Record<string, DatabaseCellValue>> {
    const result: Record<string, DatabaseCellValue> = {};
    const unnamed: string[] = [];
    for (const [fieldId, value] of Object.entries(input)) {
      const field = table.fields.find((item) => item.id === fieldId);
      if (!field) {
        throw ValidationError(`Unknown field ${fieldId}`);
      }
      if (isReadOnlyField(field)) {
        throw ValidationError(`The field "${field.name}" cannot be written`);
      }
      let normalized: DatabaseCellValue;
      try {
        normalized = this.query.normalizeInput(value, toDatabaseField(field));
      } catch (err) {
        throw ValidationError(toError(err).message);
      }
      if (field.type === DatabaseFieldType.User) {
        const people = personValues(normalized);
        unnamed.push(
          ...people.filter((person) => !person.email).map((person) => person.id)
        );
        normalized = personCell(field, people);
      }
      result[fieldId] = normalized;
    }
    if (!unnamed.length) {
      return result;
    }

    const known = await this.users.describe(table.table.teamId, uniq(unnamed));
    for (const field of table.fields) {
      const value = result[field.id];
      if (field.type !== DatabaseFieldType.User || isEmptyCell(value)) {
        continue;
      }
      const people = personValues(value).map((person) => {
        if (person.email) {
          return person;
        }
        const found = known.get(person.id);
        if (!found) {
          throw ValidationError("A person cell refers to an unknown user");
        }
        return found;
      });
      result[field.id] = personCell(field, people);
    }
    return result;
  }

  /**
   * Returns the values a new record takes in the fields that have a default:
   * « now » for a date, « me » for a person.
   *
   * @param fields the table's fields.
   * @param actor the person creating the record.
   * @param now the time of the creation.
   * @returns the default cells, keyed by field id.
   */
  public defaults(
    fields: EngineFieldRow[],
    actor: DatabaseActor,
    now: Date
  ): Record<string, DatabaseCellValue> {
    const cells: Record<string, DatabaseCellValue> = {};
    for (const field of fields) {
      const defaultValue = field.options.defaultValue;
      if (
        defaultValue === undefined ||
        defaultValue === null ||
        isReadOnlyField(field) ||
        isLinkField(field)
      ) {
        continue;
      }
      if (field.type === DatabaseFieldType.User) {
        if ([defaultValue].flat().includes("me") && actor !== "system") {
          cells[field.id] = personCell(field, [
            { id: actor.outlineUserId, title: actor.name, email: actor.email },
          ]);
        }
        continue;
      }
      const value =
        field.type === DatabaseFieldType.Date && defaultValue === "now"
          ? now.toISOString()
          : defaultValue;
      try {
        const normalized = this.query.normalizeInput(
          value,
          toDatabaseField(field)
        );
        if (!isEmptyCell(normalized)) {
          cells[field.id] = normalized;
        }
      } catch {
        // A default the field no longer accepts is left out.
      }
    }
    return cells;
  }
}

function personCell(
  field: EngineFieldRow,
  people: DatabaseUserValue[]
): DatabaseCellValue {
  if (!people.length) {
    return null;
  }
  return field.options.isMultiple || field.isMultipleCellValue
    ? people
    : people[0];
}

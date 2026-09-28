import { uniq } from "es-toolkit/compat";
import type {
  DatabaseCellValue,
  DatabaseGroup,
  DatabaseGroupHeader,
  DatabaseGroupPoint,
  DatabaseHistoryEntry,
  DatabaseRecord,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { NotFoundError } from "@server/errors";
import { isEmptyCell, personValues } from "./cells";
import { isLinkField, linkIds } from "./links";
import type { ComputedRecord, OutlineQuery } from "./query/contract";
import { toDatabaseField } from "./schema";
import type { ReadState } from "./TableReader";
import type { EngineFieldRow, EngineHistoryRow } from "./types";
import type { EngineUserDirectory } from "./users";

/**
 * Shapes what the Outline engine reads the way the routes expect it from any
 * engine: records without their empty cells, the people who created and
 * edited them named, group headers and history entries likewise. Values are
 * copies: the computed cells are shared by the process's cache, and the
 * routes complete person values in place.
 */
export class RecordPresenter {
  /**
   * @param query reads the text of cells.
   * @param users names the people.
   */
  constructor(
    private readonly query: OutlineQuery,
    private readonly users: EngineUserDirectory
  ) {}

  /**
   * Returns computed records as engine records.
   *
   * @param state the read they come from.
   * @param records the computed records.
   * @returns the records.
   */
  public async records(
    state: ReadState,
    records: ComputedRecord[]
  ): Promise<DatabaseRecord[]> {
    const metaFields = state.table.fields.filter(isRecordMetaPersonField);
    const people = metaFields.length
      ? await this.users.describe(
          state.table.table.teamId,
          uniq(
            records.flatMap((record) =>
              [record.row.createdBy, record.row.lastModifiedBy].filter(
                (id): id is string => !!id
              )
            )
          )
        )
      : new Map<string, DatabaseUserValue>();

    return records.map((record) => {
      const fields: Record<string, DatabaseCellValue> = {};
      for (const [fieldId, value] of Object.entries(record.cells)) {
        if (!isEmptyCell(value)) {
          fields[fieldId] =
            typeof value === "object" ? structuredClone(value) : value;
        }
      }
      for (const field of metaFields) {
        const personId =
          field.type === DatabaseFieldType.CreatedBy
            ? record.row.createdBy
            : record.row.lastModifiedBy;
        const person = personId ? people.get(personId) : undefined;
        if (person) {
          fields[field.id] = { ...person };
        } else {
          delete fields[field.id];
        }
      }
      return {
        id: record.row.id,
        fields,
        createdTime: record.row.createdTime,
        lastModifiedTime: record.row.lastModifiedTime,
        createdBy: record.row.createdBy ?? undefined,
        lastModifiedBy: record.row.lastModifiedBy ?? undefined,
      };
    });
  }

  /**
   * Returns one record of the table read.
   *
   * @param state the read.
   * @param recordId the record.
   * @returns the record.
   * @throws NotFoundError when the table has no such record.
   */
  public async record(
    state: ReadState,
    recordId: string
  ): Promise<DatabaseRecord> {
    const record = state.computed.record(state.table.table.id, recordId);
    if (!record) {
      throw NotFoundError("Record not found");
    }
    const [presented] = await this.records(state, [record]);
    return presented;
  }

  /**
   * Returns group points with the people heading the groups of a field that
   * shows who created or edited records named: those cells carry ids only.
   *
   * @param state the read.
   * @param group the grouping.
   * @param points the group points.
   * @returns copies of the points.
   */
  public async groupPoints(
    state: ReadState,
    group: DatabaseGroup,
    points: DatabaseGroupPoint[]
  ): Promise<DatabaseGroupPoint[]> {
    const copies = structuredClone(points);
    const metaDepths = new Set(
      group.flatMap((item, depth) => {
        const field = state.table.fields.find((f) => f.id === item.fieldId);
        return field && isRecordMetaPersonField(field) ? [depth] : [];
      })
    );
    if (!metaDepths.size) {
      return copies;
    }
    const headers = copies.filter(
      (point): point is DatabaseGroupHeader =>
        point.type === "header" && metaDepths.has(point.depth)
    );
    const people = await this.users.describe(
      state.table.table.teamId,
      uniq(
        headers.flatMap((header) =>
          personValues(header.value).map((person) => person.id)
        )
      )
    );
    for (const header of headers) {
      const [person] = personValues(header.value);
      const named = person ? people.get(person.id) : undefined;
      if (named) {
        header.value = { ...named };
      }
    }
    return copies;
  }

  /**
   * Returns history rows as history entries: field names and types from the
   * current schema (changes of deleted fields are left out), links with the
   * current titles of their records, authors named.
   *
   * @param state the read of the record's table.
   * @param rows the history rows.
   * @returns the entries, in the order of the rows.
   */
  public async history(
    state: ReadState,
    rows: EngineHistoryRow[]
  ): Promise<DatabaseHistoryEntry[]> {
    const people = await this.users.describe(
      state.table.table.teamId,
      uniq(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))
    );
    const fields = new Map(
      state.table.fields.map((field) => [field.id, field])
    );
    return rows.flatMap((row) => {
      const field = fields.get(row.fieldId);
      if (!field) {
        return [];
      }
      return [
        {
          id: row.id,
          fieldId: field.id,
          fieldName: field.name,
          fieldType: field.type,
          before: this.historyValue(state, field, row.before),
          after: this.historyValue(state, field, row.after),
          createdTime: row.createdAt,
          createdBy: row.actorId ? (people.get(row.actorId) ?? null) : null,
        },
      ];
    });
  }

  private historyValue(
    state: ReadState,
    field: EngineFieldRow,
    value: DatabaseCellValue
  ): DatabaseCellValue {
    if (!isLinkField(field) || value === null) {
      return structuredClone(value);
    }
    const foreignTableId = field.options.foreignTableId ?? "";
    const foreign = state.tables.find(
      (snapshot) => snapshot.table.id === foreignTableId
    );
    const titleField =
      foreign?.fields.find((item) => item.id === field.options.lookupFieldId) ??
      foreign?.fields.find((item) => item.isPrimary);
    return linkIds(value).map((id) => {
      const record = state.computed.record(foreignTableId, id);
      return record && titleField
        ? {
            id,
            title: this.query.cellText(
              record.cells[titleField.id] ?? null,
              toDatabaseField(titleField)
            ),
          }
        : { id };
    });
  }
}

/**
 * Tells whether a field shows who created or last edited a record.
 *
 * @param field the field.
 * @returns true for created-by and last-modified-by fields.
 */
export function isRecordMetaPersonField(field: EngineFieldRow): boolean {
  return (
    !field.isLookup &&
    (field.type === DatabaseFieldType.CreatedBy ||
      field.type === DatabaseFieldType.LastModifiedBy)
  );
}

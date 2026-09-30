import { Op } from "sequelize";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroup,
  DatabaseGroupHeader,
  DatabaseLinkValue,
  DatabaseRecord,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { Database, Document } from "@server/models";

/** The icon of a row's page. */
export interface DatabaseRowIcon {
  icon: string | null;
  iconColor: string | null;
}

/**
 * The icons rows show, taken from their pages as in Notion: a row shows the
 * icon of its own page, a relation the icon of each linked row's page.
 */
export class DatabaseRowIcons {
  /**
   * Returns the icon of the page of each row of a database that has one, in
   * one query.
   *
   * @param databaseId the database.
   * @param recordIds the rows.
   * @returns the page and its icon, by record id.
   */
  public static async ofRows(
    databaseId: string,
    recordIds: string[]
  ): Promise<Map<string, DatabaseRowIcon & { documentId: string }>> {
    if (!recordIds.length) {
      return new Map();
    }
    const documents = await Document.unscoped().findAll({
      attributes: ["id", "databaseRecordId", "icon", "color"],
      where: { databaseId, databaseRecordId: recordIds },
    });
    return new Map(
      documents.flatMap((document) =>
        document.databaseRecordId
          ? [
              [
                document.databaseRecordId,
                {
                  documentId: document.id,
                  icon: document.icon ?? null,
                  iconColor: document.color ?? null,
                },
              ],
            ]
          : []
      )
    );
  }

  /**
   * Fills `icon` and `iconColor` of the relation values of records, from the
   * pages of the linked rows, in two queries whatever the number of relations.
   *
   * @param teamId the team of the database.
   * @param fields the fields of the database, to know its relations.
   * @param records the records, changed in place.
   */
  public static async enrichLinks(
    teamId: string,
    fields: DatabaseField[],
    records: DatabaseRecord[]
  ): Promise<void> {
    await this.enrichCells(
      teamId,
      fields,
      records.flatMap((record) => Object.entries(record.fields))
    );
  }

  /**
   * Fills `icon` and `iconColor` of the relation values among cells, see
   * `enrichLinks`.
   *
   * @param teamId the team of the database.
   * @param fields the fields of the database, to know its relations.
   * @param cells the cells as field id and value, their values changed in place.
   */
  public static async enrichCells(
    teamId: string,
    fields: DatabaseField[],
    cells: [string, DatabaseCellValue][]
  ): Promise<void> {
    const tableByField = new Map<string, string>();
    for (const field of fields) {
      if (
        field.type === DatabaseFieldType.Link &&
        field.options.foreignTableId
      ) {
        tableByField.set(field.id, field.options.foreignTableId);
      }
    }
    const valuesByTable = new Map<string, DatabaseLinkValue[]>();
    for (const [fieldId, value] of cells) {
      const tableId = tableByField.get(fieldId);
      if (!tableId) {
        continue;
      }
      const values = valuesByTable.get(tableId) ?? [];
      values.push(...linkValuesIn(value));
      valuesByTable.set(tableId, values);
    }
    await this.enrichLinkValues(teamId, valuesByTable);
  }

  /**
   * Fills `icon` and `iconColor` of the relation values heading groups.
   *
   * @param teamId the team of the database.
   * @param fields the fields of the database, to know its relations.
   * @param levels the grouping, a header's depth being its level.
   * @param headers the group headers, their values changed in place.
   */
  public static async enrichGroupHeaders(
    teamId: string,
    fields: DatabaseField[],
    levels: DatabaseGroup | null | undefined,
    headers: DatabaseGroupHeader[]
  ): Promise<void> {
    const cells: [string, DatabaseCellValue][] = [];
    for (const header of headers) {
      const fieldId = levels?.[header.depth]?.fieldId;
      if (fieldId) {
        cells.push([fieldId, header.value]);
      }
    }
    await this.enrichCells(teamId, fields, cells);
  }

  /**
   * Fills `icon` and `iconColor` of relation values from the pages of the
   * linked rows. A value whose row has no page gets null.
   *
   * @param teamId the team of the databases.
   * @param valuesByTable the relation values, by engine table of the linked rows.
   */
  public static async enrichLinkValues(
    teamId: string,
    valuesByTable: Map<string, DatabaseLinkValue[]>
  ): Promise<void> {
    const entries = [...valuesByTable].filter(([, values]) => values.length);
    if (!entries.length) {
      return;
    }
    const databases = await Database.findAll({
      attributes: ["id", "externalTableId"],
      where: { teamId, externalTableId: entries.map(([tableId]) => tableId) },
    });
    const databaseIdByTable = new Map(
      databases.map((database) => [database.externalTableId, database.id])
    );
    const conditions = entries.flatMap(([tableId, values]) => {
      const databaseId = databaseIdByTable.get(tableId);
      return databaseId
        ? [
            {
              databaseId,
              databaseRecordId: [...new Set(values.map((value) => value.id))],
            },
          ]
        : [];
    });
    const documents = conditions.length
      ? await Document.unscoped().findAll({
          attributes: ["databaseId", "databaseRecordId", "icon", "color"],
          where: { [Op.or]: conditions },
        })
      : [];
    const iconByRow = new Map(
      documents.map((document) => [
        rowKey(document.databaseId, document.databaseRecordId),
        document,
      ])
    );
    for (const [tableId, values] of entries) {
      const databaseId = databaseIdByTable.get(tableId);
      for (const value of values) {
        const document = databaseId
          ? iconByRow.get(rowKey(databaseId, value.id))
          : undefined;
        value.icon = document?.icon ?? null;
        value.iconColor = document?.color ?? null;
      }
    }
  }

  /**
   * Whether cells may hold relation values, to spare reading the schema of a
   * table whose rows hold none: an object that is neither a person nor a file.
   *
   * @param records the records.
   * @returns true when a cell looks like a relation.
   */
  public static mayHoldLinks(records: DatabaseRecord[]): boolean {
    return records.some((record) =>
      Object.values(record.fields).some((value) => this.mayBeLink(value))
    );
  }

  /**
   * Whether a cell value may hold relation values, see `mayHoldLinks`.
   *
   * @param value the cell value.
   * @returns true when it looks like a relation.
   */
  public static mayBeLink(value: DatabaseCellValue | undefined): boolean {
    return linkValuesIn(value).length > 0;
  }
}

/**
 * Returns the values of a cell shaped like relation values.
 *
 * @param value the cell value.
 * @returns the relation values, the same objects.
 */
function linkValuesIn(
  value: DatabaseCellValue | undefined
): DatabaseLinkValue[] {
  if (value === null || value === undefined || typeof value !== "object") {
    return [];
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.filter(isLinkShaped);
}

function isLinkShaped(value: unknown): value is DatabaseLinkValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    !("email" in value) &&
    !("mimetype" in value)
  );
}

function rowKey(databaseId: string | null, recordId: string | null): string {
  return `${databaseId}:${recordId}`;
}

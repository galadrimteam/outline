import type { DatabaseCellValue } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type {
  EngineFieldRow,
  EngineRecordRow,
  TableSnapshot,
} from "../../types";
import type { ComputedBase, ComputedRecord } from "../contract";
import { isComputedField } from "../fields";
import { cellText } from "../text";

/**
 * The records of a base while their computed cells are filled in, then as
 * the reads see them. Stored cells of computed fields are dropped, system
 * fields are filled at once; people are given by id only (`title` is empty),
 * the engine knows their names.
 */
export class ComputedState implements ComputedBase {
  private readonly tables = new Map<string, ComputedRecord[]>();
  private readonly byId = new Map<string, Map<string, ComputedRecord>>();
  private readonly titles = new Map<string, Map<string, string>>();

  constructor(snapshots: TableSnapshot[]) {
    for (const snapshot of snapshots) {
      const computed = snapshot.fields.filter(isComputedField);
      const records = [...snapshot.records]
        .sort((a, b) => a.autoNumber - b.autoNumber)
        .map((row) => ({ row, cells: initialCells(row, computed) }));
      this.tables.set(snapshot.table.id, records);
      this.byId.set(
        snapshot.table.id,
        new Map(records.map((record) => [record.row.id, record]))
      );
    }
  }

  /**
   * Returns the records of a table.
   *
   * @param tableId the table.
   * @returns the records in creation order, none for an unknown table.
   */
  public records(tableId: string): ComputedRecord[] {
    return this.tables.get(tableId) ?? [];
  }

  /**
   * Returns one record of a table.
   *
   * @param tableId the table.
   * @param recordId the record.
   * @returns the record, if it exists.
   */
  public record(tableId: string, recordId: string): ComputedRecord | undefined {
    return this.byId.get(tableId)?.get(recordId);
  }

  /**
   * Finds records of a table by id, skipping ids that name no record.
   *
   * @param tableId the table.
   * @param ids the record ids.
   * @returns the records, in the order of the ids.
   */
  public linked(tableId: string | undefined, ids: string[]): ComputedRecord[] {
    const records = tableId ? this.byId.get(tableId) : undefined;
    if (!records) {
      return [];
    }
    return ids.flatMap((id) => {
      const record = records.get(id);
      return record ? [record] : [];
    });
  }

  /**
   * Returns the title of a record: the text of a field of its table (the
   * one a link shows). Titles are read once per field; call it only once
   * that field is computed.
   *
   * @param record the record.
   * @param titleField the field giving titles.
   * @returns the title.
   */
  public title(
    record: ComputedRecord,
    titleField: EngineFieldRow | undefined
  ): string {
    if (!titleField) {
      return "";
    }
    let titles = this.titles.get(titleField.id);
    if (!titles) {
      titles = new Map();
      this.titles.set(titleField.id, titles);
    }
    let title = titles.get(record.row.id);
    if (title === undefined) {
      title = cellText(record.cells[titleField.id], titleField);
      titles.set(record.row.id, title);
    }
    return title;
  }
}

function initialCells(
  row: EngineRecordRow,
  computed: EngineFieldRow[]
): Record<string, DatabaseCellValue> {
  const cells: Record<string, DatabaseCellValue> = { ...row.cells };
  for (const field of computed) {
    cells[field.id] = field.isLookup ? null : systemCell(row, field.type);
  }
  return cells;
}

function systemCell(
  row: EngineRecordRow,
  type: DatabaseFieldType
): DatabaseCellValue {
  switch (type) {
    case DatabaseFieldType.AutoNumber:
      return row.autoNumber;
    case DatabaseFieldType.CreatedTime:
      return row.createdTime;
    case DatabaseFieldType.LastModifiedTime:
      return row.lastModifiedTime;
    case DatabaseFieldType.CreatedBy:
      return row.createdBy ? { id: row.createdBy, title: "" } : null;
    case DatabaseFieldType.LastModifiedBy:
      return row.lastModifiedBy ? { id: row.lastModifiedBy, title: "" } : null;
    default:
      return null;
  }
}

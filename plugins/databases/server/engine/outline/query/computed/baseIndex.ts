import type { EngineFieldRow, TableSnapshot } from "../../types";
import type { FieldResolver } from "../formula/compiled";

/** A field with the table holding it. */
export interface LocatedField {
  field: EngineFieldRow;
  table: TableSnapshot;
}

/** The tables and fields of a base, looked up by id. */
export class BaseIndex {
  private readonly tables = new Map<string, TableSnapshot>();
  private readonly fields = new Map<string, LocatedField>();
  private readonly byName = new Map<string, Map<string, EngineFieldRow>>();

  constructor(tables: TableSnapshot[]) {
    for (const table of tables) {
      this.tables.set(table.table.id, table);
      const names = new Map<string, EngineFieldRow>();
      for (const field of table.fields) {
        this.fields.set(field.id, { field, table });
        if (!names.has(field.name)) {
          names.set(field.name, field);
        }
      }
      this.byName.set(table.table.id, names);
    }
  }

  /**
   * Finds a table.
   *
   * @param tableId the table id.
   * @returns the table, if in the base.
   */
  public table(tableId: string | undefined): TableSnapshot | undefined {
    return tableId ? this.tables.get(tableId) : undefined;
  }

  /**
   * Finds a field anywhere in the base.
   *
   * @param fieldId the field id.
   * @returns the field and its table, if in the base.
   */
  public field(fieldId: string | undefined): LocatedField | undefined {
    return fieldId ? this.fields.get(fieldId) : undefined;
  }

  /**
   * Returns how a formula of a table finds its fields: by id, or by name as
   * a fallback.
   *
   * @param table the table of the formula.
   * @returns the resolver.
   */
  public resolver(table: TableSnapshot): FieldResolver {
    const names = this.byName.get(table.table.id);
    return (reference) => {
      const located = this.fields.get(reference);
      if (located && located.table.table.id === table.table.id) {
        return located.field;
      }
      return names?.get(reference);
    };
  }

  /**
   * Returns the field whose text names a table's records: the primary field.
   *
   * @param tableId the table id.
   * @returns the primary field, or the first field when none is marked.
   */
  public primaryField(tableId: string | undefined): EngineFieldRow | undefined {
    const fields = this.table(tableId)?.fields ?? [];
    return (
      fields.find((field) => field.isPrimary) ??
      [...fields].sort((a, b) => a.order - b.order)[0]
    );
  }
}

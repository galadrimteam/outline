import type * as React from "react";
import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseField,
  DatabaseRecord,
} from "@shared/databases/types";
import type Database from "~/models/Database";

/** Where a cell is drawn: dense table cell, board or gallery card, or row page property. */
export type CellVariant = "table" | "card" | "property";

/** What every cell renderer receives. */
export interface CellRendererProps {
  /** The field (column) of the cell. */
  field: DatabaseField;
  /** The raw value of the cell. */
  value: DatabaseCellValue | undefined;
  /** The database the field belongs to. */
  database: Database;
  /** Where the cell is drawn. */
  variant: CellVariant;
  /** The row of the cell, when the host has it: date ranges read their end, attachments upload to it. */
  record?: DatabaseRecord;
  /** Whether table cells wrap their content instead of truncating it. */
  wrap?: boolean;
}

/** What every cell editor receives on top of the renderer props. */
export interface CellEditorProps extends CellRendererProps {
  /** Writes the new value of the cell. */
  onChange: (value: DatabaseCellInput) => void;
  /** Ends editing; the host shows the renderer again. */
  onClose: () => void;
  /**
   * Writes several fields of the row at once (a date range writes its start and its end). Hosts
   * that omit it only get single-field edits.
   */
  onChangeFields?: (fields: Record<string, DatabaseCellInput>) => void;
  /**
   * What the reader typed on the selected cell to open the editor: it replaces the value of a
   * text editor and starts the search of a picker.
   */
  initialInput?: string;
}

/** How a field type is drawn and edited. */
export interface CellDefinition {
  /** Draws the value. */
  Renderer: React.ComponentType<CellRendererProps>;
  /** Edits the value; absent for types that are never edited in place. */
  Editor?: React.ComponentType<CellEditorProps>;
  /** Whether cells of this field can be edited by someone with write access. */
  isEditable: (field: DatabaseField) => boolean;
  /** Whether typing on a selected cell opens its editor with what was typed. */
  opensOnTyping?: boolean;
}

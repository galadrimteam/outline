import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseField,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { hasChoice } from "../../cells/choices";
import {
  cellValueToText,
  isAttachmentItem,
  isDateField,
  isLinkItem,
  isUserItem,
  parseNumberInput,
  toArray,
} from "../../cells/format";

/** The clipboard type of copied cells, written next to their text. */
export const CELLS_MIME = "application/x-outline-database-cells+json";

/** A copied cell: its value and what the paste needs to know of its field. */
export interface CopiedCell {
  type: DatabaseFieldType;
  /** Whether the field holds dates (date fields, date formulas…). */
  isDate: boolean;
  /** The table a relation field links to. */
  foreignTableId?: string;
  value: DatabaseCellValue;
}

/** Cells copied from a table, as written to the clipboard. */
export interface CopiedCells {
  /** The text written next to them, which a paste compares with the clipboard's. */
  text: string;
  /** The cells, by line then column. */
  cells: CopiedCell[][];
}

/** A cell to copy: its field and its value. */
export interface CellToCopy {
  field: DatabaseField;
  value: DatabaseCellValue | undefined;
}

/** A value to write in a cell, and the options it needs first. */
export interface PasteValue {
  value: DatabaseCellInput;
  /** Options of a select field that the value adds. */
  newChoices?: string[];
}

/** The writes of a paste: one update per row. */
export interface PastePlan {
  updates: { recordId: string; values: Record<string, DatabaseCellInput> }[];
  /** New options per select field, to create before the updates. */
  newChoices: Record<string, string[]>;
  /** Cells left unchanged: read-only, or a text they cannot take. */
  skipped: number;
}

/**
 * Copies cells as spreadsheets do: tab-separated text of what the cells show, and the values
 * themselves under `CELLS_MIME` so that a paste in a table keeps them exactly.
 *
 * @param rows the cells, by line then column.
 * @param locale the reader's locale, for numbers and dates.
 * @returns the clipboard text and data.
 */
export function copyCells(
  rows: CellToCopy[][],
  locale?: string
): { text: string; data: string } {
  const text = toTsv(
    rows.map((row) =>
      row.map(({ field, value }) => cellValueToText(field, value, locale))
    )
  );
  const copied: CopiedCells = {
    text,
    cells: rows.map((row) =>
      row.map(({ field, value }) => ({
        type: field.type,
        isDate: isDateField(field),
        foreignTableId: field.options.foreignTableId,
        value: value ?? null,
      }))
    ),
  };
  return { text, data: JSON.stringify(copied) };
}

/**
 * Tab-separated text, a cell holding a tab, a line break or a quote being quoted.
 *
 * @param rows the texts, by line then column.
 * @returns the text.
 */
export function toTsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          /[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
        )
        .join("\t")
    )
    .join("\n");
}

/**
 * Reads tab-separated text as spreadsheets write it (quoted cells may hold tabs and line breaks).
 *
 * @param text the pasted text.
 * @returns the texts, by line then column; one empty cell for an empty text.
 */
export function parseTsv(text: string): string[][] {
  const input = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/**
 * The copied cells behind a pasted text, when the text is the one they were copied with.
 *
 * @param text the pasted text.
 * @param data what the clipboard holds under `CELLS_MIME`.
 * @returns the cells, or undefined for text from elsewhere.
 */
export function readCopiedCells(
  text: string,
  data: string | undefined
): CopiedCells | undefined {
  if (!data) {
    return undefined;
  }
  try {
    const copied = JSON.parse(data) as CopiedCells;
    const normalize = (value: string) => value.replace(/\r\n?/g, "\n");
    return Array.isArray(copied.cells) &&
      normalize(copied.text) === normalize(text)
      ? copied
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Converts a pasted cell for a field, like a value typed in its editor: the copied value itself
 * when it fits the field, else the text (numbers read, options by name, dates and people left to
 * the server's reading). An empty text clears the cell.
 *
 * @param field the field pasted into.
 * @param text the pasted text of the cell.
 * @param copied the copied cell behind the text, when it comes from a table.
 * @param findUser the Outline user named by a text (name or email), if any.
 * @returns the value to write, or undefined when the field cannot take it.
 */
export function pasteValue(
  field: DatabaseField,
  text: string,
  copied: CopiedCell | undefined,
  findUser: (text: string) => string | undefined
): PasteValue | undefined {
  const trimmed = text.trim();
  if (!trimmed && !hasValue(copied)) {
    return { value: null };
  }
  switch (field.type) {
    case DatabaseFieldType.SingleLineText:
    case DatabaseFieldType.LongText:
      return { value: text };
    case DatabaseFieldType.Number:
    case DatabaseFieldType.Rating: {
      const number =
        typeof copied?.value === "number"
          ? copied.value
          : parseNumberInput(trimmed, field.options.formatting);
      return number === null ? undefined : { value: number };
    }
    case DatabaseFieldType.Checkbox: {
      if (typeof copied?.value === "boolean") {
        return { value: copied.value || null };
      }
      const checked = checkedByText(trimmed);
      return checked === undefined ? undefined : { value: checked || null };
    }
    case DatabaseFieldType.SingleSelect:
    case DatabaseFieldType.MultipleSelect:
      return selectValue(field, trimmed, copied);
    case DatabaseFieldType.Date:
      return {
        value:
          copied?.isDate && typeof copied.value === "string"
            ? copied.value
            : trimmed,
      };
    case DatabaseFieldType.User:
      return userValue(field, trimmed, copied, findUser);
    case DatabaseFieldType.Link: {
      const links =
        copied?.type === DatabaseFieldType.Link &&
        copied.foreignTableId === field.options.foreignTableId
          ? toArray(copied.value).filter(isLinkItem)
          : [];
      return links.length
        ? { value: links.map((link) => ({ id: link.id })) }
        : undefined;
    }
    case DatabaseFieldType.Attachment: {
      const files =
        copied?.type === DatabaseFieldType.Attachment
          ? toArray(copied.value).filter(isAttachmentItem)
          : [];
      return files.length ? { value: files } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Plans a paste from a cell: the pasted lines go to the rows from that cell's row down and the
 * pasted columns to the columns from that cell's rightwards, as far as the table goes.
 *
 * @param params the pasted texts, the copied cells behind them, the table and the target cell.
 * @returns the writes, one per row.
 */
export function planPaste({
  texts,
  copied,
  rowIds,
  fields,
  start,
  canWrite,
  findUser,
}: {
  texts: string[][];
  copied?: CopiedCells;
  rowIds: string[];
  fields: DatabaseField[];
  start: { row: number; col: number };
  canWrite: (field: DatabaseField) => boolean;
  findUser: (text: string) => string | undefined;
}): PastePlan {
  const plan: PastePlan = { updates: [], newChoices: {}, skipped: 0 };
  texts.forEach((line, lineIndex) => {
    const recordId = rowIds[start.row + lineIndex];
    if (!recordId) {
      return;
    }
    const values: Record<string, DatabaseCellInput> = {};
    line.forEach((text, colIndex) => {
      const field = fields[start.col + colIndex];
      if (!field) {
        return;
      }
      const cell = copied?.cells[lineIndex]?.[colIndex];
      const pasted = canWrite(field)
        ? pasteValue(field, text, cell, findUser)
        : undefined;
      if (!pasted) {
        plan.skipped++;
        return;
      }
      values[field.id] = pasted.value;
      for (const name of pasted.newChoices ?? []) {
        const names = (plan.newChoices[field.id] ??= []);
        const key = name.toLocaleLowerCase();
        if (!names.some((item) => item.toLocaleLowerCase() === key)) {
          names.push(name);
        }
      }
    });
    if (Object.keys(values).length) {
      plan.updates.push({ recordId, values });
    }
  });
  return plan;
}

function hasValue(copied: CopiedCell | undefined): boolean {
  return !!copied && toArray(copied.value).length > 0;
}

function selectValue(
  field: DatabaseField,
  text: string,
  copied: CopiedCell | undefined
): PasteValue {
  const fromCopy =
    copied?.type === DatabaseFieldType.SingleSelect ||
    copied?.type === DatabaseFieldType.MultipleSelect
      ? toArray(copied.value).filter(
          (item): item is string => typeof item === "string" && item !== ""
        )
      : undefined;
  const multiple = field.type === DatabaseFieldType.MultipleSelect;
  const names = Array.from(
    new Set(
      (
        fromCopy ??
        (multiple ? text.split(",").map((name) => name.trim()) : [text])
      ).filter(Boolean)
    )
  );
  const kept = multiple ? names : names.slice(0, 1);
  const newChoices = kept.filter(
    (name) => !hasChoice(field.options.choices ?? [], name)
  );
  return {
    value: multiple ? (kept.length ? kept : null) : (kept[0] ?? null),
    ...(newChoices.length ? { newChoices } : {}),
  };
}

function userValue(
  field: DatabaseField,
  text: string,
  copied: CopiedCell | undefined,
  findUser: (text: string) => string | undefined
): PasteValue | undefined {
  const ids =
    copied?.type === DatabaseFieldType.User
      ? toArray(copied.value)
          .filter(isUserItem)
          .map((person) => person.outlineUserId)
      : text.split(",").map((name) => findUser(name.trim()));
  const found = ids.filter((id): id is string => !!id);
  if (!found.length || found.length !== ids.length) {
    return undefined;
  }
  const multiple = field.options.isMultiple ?? field.isMultipleCellValue;
  const people = Array.from(new Set(found)).map((outlineUserId) => ({
    outlineUserId,
  }));
  return { value: multiple ? people : people.slice(0, 1) };
}

function checkedByText(text: string): boolean | undefined {
  const normalized = text.toLocaleLowerCase();
  if (
    ["✓", "✔", "x", "1", "true", "yes", "oui", "checked"].includes(normalized)
  ) {
    return true;
  }
  if (["", "0", "false", "no", "non", "unchecked"].includes(normalized)) {
    return false;
  }
  return undefined;
}

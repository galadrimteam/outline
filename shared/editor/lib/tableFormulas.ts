import type { Node as ProsemirrorNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { TableMap } from "prosemirror-tables";
import { computeCell } from "./formula";

/**
 * A formula column is a column whose header cell carries a `formula` attribute:
 * every other cell of the column shows the formula computed on its row, the way
 * a Notion formula property does. Other columns are read by their header text.
 */

/** Matches the formula written after a header's text in Markdown: `Total {=…}`. */
const MARKDOWN_FORMULA = /\s*\{=(.*)\}\s*$/;

/**
 * Split the Markdown source of a header cell into its text and its formula.
 *
 * @param content - the raw source of the header cell.
 * @returns the text without the formula, and the formula if there is one.
 */
export function splitHeaderFormula(content: string): {
  text: string;
  formula: string | null;
} {
  const match = content.match(MARKDOWN_FORMULA);
  if (!match || !match[1].trim()) {
    return { text: content, formula: null };
  }
  return {
    text: content.slice(0, match.index),
    // A pipe ends a table cell in Markdown, so the serializer escapes it.
    formula: match[1].replace(/\\\|/g, "|").trim(),
  };
}

/**
 * Write a formula the way splitHeaderFormula reads it back.
 *
 * @param formula - the formula of a header cell.
 * @returns the Markdown to append after the header's text.
 */
export function headerFormulaMarkdown(formula: string): string {
  return ` {=${formula.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")}}`;
}

/**
 * The value of a cell as a formula reads it: a check box is ☑ or ☐, anything
 * else is its text.
 *
 * @param cell - a table cell.
 * @returns the text standing for the cell's value.
 */
export function cellText(cell: ProsemirrorNode): string {
  let box: string | null = null;
  cell.descendants((node) => {
    if (box === null && node.type.name === "checkbox_item") {
      box = node.attrs.checked ? "☑" : "☐";
    }
    return box === null;
  });
  return box ?? cell.textContent.trim();
}

/**
 * Compute every formula column of one table.
 *
 * @param table - the table node.
 * @param now - the clock used by now() and today().
 * @returns the offsets (inside the table) and new texts of the cells to change.
 */
export function computeTable(
  table: ProsemirrorNode,
  now?: () => Date
): Array<{ offset: number; cell: ProsemirrorNode; text: string }> {
  const map = TableMap.get(table);
  if (map.height < 2) {
    return [];
  }

  const names: string[] = [];
  const formulas: Array<{ column: number; formula: string }> = [];
  for (let column = 0; column < map.width; column++) {
    const offset = map.map[column];
    const header = table.nodeAt(offset);
    if (!header || header.type.spec.tableRole !== "header_cell") {
      return [];
    }
    // A header spanning several columns has no single column to compute.
    const spans =
      map.map[column + 1] === offset || map.map[column - 1] === offset;
    names.push(header.textContent.trim());
    if (header.attrs.formula && !spans) {
      formulas.push({ column, formula: header.attrs.formula });
    }
  }
  if (formulas.length === 0) {
    return [];
  }

  const changes: Array<{
    offset: number;
    cell: ProsemirrorNode;
    text: string;
  }> = [];
  for (let row = 1; row < map.height; row++) {
    const values: Record<string, string> = {};
    for (let column = map.width - 1; column >= 0; column--) {
      const cell = table.nodeAt(map.map[row * map.width + column]);
      if (cell && names[column]) {
        // The leftmost column of a given name wins, as it is the one users see first.
        values[names[column]] = cellText(cell);
      }
    }

    // A formula may read another formula column: compute until nothing moves,
    // at most once per formula so that a cycle cannot loop.
    for (let pass = 0; pass < formulas.length; pass++) {
      let moved = false;
      for (const { column, formula } of formulas) {
        const value = computeCell(formula, values, now);
        if (names[column] && values[names[column]] !== value) {
          values[names[column]] = value;
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }

    for (const { column, formula } of formulas) {
      const offset = map.map[row * map.width + column];
      const cell = table.nodeAt(offset);
      // A cell merged across rows or columns is left to its first position.
      if (
        !cell ||
        (row > 1 && map.map[(row - 1) * map.width + column] === offset)
      ) {
        continue;
      }
      const text = names[column]
        ? values[names[column]]
        : computeCell(formula, values, now);
      if (cellText(cell) !== text || cell.childCount !== 1) {
        changes.push({ offset, cell, text });
      }
    }
  }
  return changes;
}

/**
 * Build the transaction writing every formula column of the document, or null
 * when every computed cell already shows its value.
 *
 * @param state - the editor state.
 * @param now - the clock used by now() and today().
 * @returns the transaction, or null.
 */
export function recomputeFormulas(
  state: EditorState,
  now?: () => Date
): Transaction | null {
  const { schema } = state;
  const changes: Array<{ pos: number; cell: ProsemirrorNode; text: string }> =
    [];

  state.doc.descendants((node, pos) => {
    if (node.type.spec.tableRole !== "table") {
      return true;
    }
    for (const change of computeTable(node, now)) {
      changes.push({ ...change, pos: pos + 1 + change.offset });
    }
    return false;
  });

  if (changes.length === 0) {
    return null;
  }

  const tr = state.tr;
  // From the end so that earlier positions stay valid.
  changes
    .sort((a, b) => b.pos - a.pos)
    .forEach(({ pos, cell, text }) => {
      const paragraph = schema.nodes.paragraph.create(
        null,
        text ? schema.text(text) : null
      );
      tr.replaceWith(pos + 1, pos + cell.nodeSize - 1, paragraph);
    });
  return tr;
}

/** A cell of the table, by row and column index among the rows and columns shown. */
export interface CellPosition {
  row: number;
  col: number;
}

/** The keys that move the active cell. */
export type NavigationKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Tab"
  | "ShiftTab"
  | "Home"
  | "End";

/**
 * The cell a key moves to, like a spreadsheet: arrows stop at the edges, Tab wraps to the next
 * row and Shift+Tab to the previous one.
 *
 * @param position the active cell.
 * @param key the key pressed.
 * @param rows the number of rows.
 * @param cols the number of columns.
 * @returns the new active cell.
 */
export function moveCell(
  position: CellPosition,
  key: NavigationKey,
  rows: number,
  cols: number
): CellPosition {
  if (!rows || !cols) {
    return position;
  }
  const clampRow = (row: number) => Math.min(Math.max(row, 0), rows - 1);
  const clampCol = (col: number) => Math.min(Math.max(col, 0), cols - 1);
  const { row, col } = position;

  switch (key) {
    case "ArrowUp":
      return { row: clampRow(row - 1), col };
    case "ArrowDown":
      return { row: clampRow(row + 1), col };
    case "ArrowLeft":
      return { row, col: clampCol(col - 1) };
    case "ArrowRight":
      return { row, col: clampCol(col + 1) };
    case "Home":
      return { row, col: 0 };
    case "End":
      return { row, col: cols - 1 };
    case "Tab":
      if (col < cols - 1) {
        return { row, col: col + 1 };
      }
      return row < rows - 1 ? { row: row + 1, col: 0 } : position;
    case "ShiftTab":
      if (col > 0) {
        return { row, col: col - 1 };
      }
      return row > 0 ? { row: row - 1, col: cols - 1 } : position;
    default:
      return position;
  }
}

/**
 * Reads the navigation key of a keyboard event.
 *
 * @param event the key event.
 * @returns the navigation key, or undefined for other keys.
 */
export function navigationKey(event: {
  key: string;
  shiftKey: boolean;
}): NavigationKey | undefined {
  switch (event.key) {
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
    case "Home":
    case "End":
      return event.key;
    case "Tab":
      return event.shiftKey ? "ShiftTab" : "Tab";
    default:
      return undefined;
  }
}

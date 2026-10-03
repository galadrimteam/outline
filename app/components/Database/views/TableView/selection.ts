/** A click that changes the selected rows. */
export interface SelectionClick {
  /** The rows in their order on screen. */
  ids: string[];
  /** The row clicked before, from which Shift extends the selection. */
  anchor: string | null;
  /** Shift: adds the rows from the anchor to the clicked one. */
  extend: boolean;
  /** Adds or removes the clicked row alone: a checkbox, or Cmd/Ctrl on a handle. */
  toggle: boolean;
}

/**
 * The rows selected after a click on a row's drag handle or checkbox. As in Notion, a plain click
 * on a handle selects that row alone, or clears it when it was the only one selected.
 *
 * @param current the rows selected before.
 * @param recordId the row clicked.
 * @param click how it was clicked.
 * @returns the rows selected after.
 */
export function nextSelection(
  current: string[],
  recordId: string,
  click: SelectionClick
): string[] {
  if (click.extend && click.anchor) {
    const from = click.ids.indexOf(click.anchor);
    const to = click.ids.indexOf(recordId);
    if (from !== -1 && to !== -1) {
      const range = click.ids.slice(Math.min(from, to), Math.max(from, to) + 1);
      return Array.from(new Set([...current, ...range]));
    }
  }
  if (click.toggle) {
    return current.includes(recordId)
      ? current.filter((id) => id !== recordId)
      : [...current, recordId];
  }
  return current.length === 1 && current[0] === recordId ? [] : [recordId];
}

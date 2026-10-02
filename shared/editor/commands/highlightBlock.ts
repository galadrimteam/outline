import type { MarkType } from "prosemirror-model";
import type { Command } from "prosemirror-state";

/**
 * Highlights the whole text of the block holding the cursor, the nearest
 * thing to the background colour Notion gives a block, or clears it. Text
 * typed next in the block takes the same highlight.
 *
 * @param type the highlight mark type.
 * @param color the highlight colour, or null to clear the block's highlight.
 * @returns a prosemirror command.
 */
export function highlightBlock(type: MarkType, color: string | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if (!$from.parent.isTextblock) {
      return false;
    }

    if (dispatch) {
      const from = $from.start();
      const to = $from.end();
      const tr = state.tr.removeMark(from, to, type).removeStoredMark(type);
      if (color) {
        const mark = type.create({ color });
        tr.addMark(from, to, mark).addStoredMark(mark);
      }
      dispatch(tr);
    }
    return true;
  };
}

import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";

/**
 * Selects the whole text of the block holding the cursor, so that a command
 * acting on a selection, such as commenting, acts on the block as Notion's
 * block commands do.
 *
 * @returns a prosemirror command, which fails when the block holds no text.
 */
export function selectTextblock(): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if (!$from.parent.isTextblock || !$from.parent.content.size) {
      return false;
    }

    dispatch?.(
      state.tr.setSelection(
        TextSelection.create(state.doc, $from.start(), $from.end())
      )
    );
    return true;
  };
}

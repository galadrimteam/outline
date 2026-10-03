import type UiStore from "~/stores/UiStore";
import type { SplitViewPane } from "~/utils/splitView";

/** Opens the page of a row and resolves with the pane it opened in, undefined when it failed. */
export type RowPageOpener = (
  recordId: string
) => Promise<SplitViewPane | undefined>;

/**
 * Opens the comments of a row, where a click on its comment count leads in Notion: the row's
 * page, with the comments panel of the pane it opened in.
 *
 * @param openRow opens the page of the row.
 * @param ui the UI store, which holds the panel shown on the right of each pane.
 * @param recordId the row.
 * @returns resolves once the page and its comments are open.
 */
export async function openRowComments(
  openRow: RowPageOpener,
  ui: Pick<UiStore, "setRightSidebar">,
  recordId: string
): Promise<void> {
  const pane = await openRow(recordId);
  if (pane) {
    ui.setRightSidebar("comments", pane);
  }
}

import type UiStore from "~/stores/UiStore";
import type { SplitViewPane } from "~/utils/splitView";

/** Opens the page of a row and resolves with the pane it opened in, undefined when it failed. */
export type RowPageOpener = (
  recordId: string
) => Promise<SplitViewPane | undefined>;

/**
 * Opens the comments of a row, where a click on its comment count leads in Notion: the row's
 * page, with its discussions in view and the form that starts one focused.
 *
 * @param openRow opens the page of the row.
 * @param ui the UI store, which carries the request to the page.
 * @param recordId the row.
 * @returns resolves once the page is open.
 */
export async function openRowComments(
  openRow: RowPageOpener,
  ui: Pick<UiStore, "setPageCommentsRequest">,
  recordId: string
): Promise<void> {
  ui.setPageCommentsRequest(recordId);
  const pane = await openRow(recordId);
  if (!pane) {
    ui.setPageCommentsRequest(null);
  }
}

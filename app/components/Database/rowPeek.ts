import { useLocation } from "react-router-dom";
import useStores from "~/hooks/useStores";
import type UiStore from "~/stores/UiStore";
import browserHistory from "~/utils/history";
import { isKeyboardWidget } from "~/utils/isKeyboardWidget";
import type { SplitViewPane } from "~/utils/splitView";
import {
  closeSplitPane,
  getSplitPath,
  openRouteInSplit,
} from "~/utils/splitView";

/**
 * Whether a page is a row page shown beside its database: Notion's side peek, which opens here
 * in the side pane of the split view.
 *
 * @param pane the pane the page is shown in.
 * @param document the page.
 * @returns true for a row page in the side pane.
 */
export function isRowPeek(
  pane: SplitViewPane,
  document: { databaseId?: string | null }
): boolean {
  return pane === "secondary" && !!document.databaseId;
}

/**
 * The slug of the page shown in the side pane, read from the location of the main pane.
 *
 * @param search the query string of the main pane's location.
 * @returns the page slug, undefined when no page is shown beside.
 */
export function peekedDocumentSlug(search: string): string | undefined {
  const segments = getSplitPath(search)?.split(/[?#]/)[0].split("/") ?? [];
  const index = segments.indexOf("doc");
  return index === -1 ? undefined : segments[index + 1] || undefined;
}

/**
 * The row of a database whose page is open in the side pane, so that its table row or card shows
 * it as Notion frames the row of its side peek.
 *
 * @param databaseId the database.
 * @returns the row id, undefined when none of its rows is open beside.
 */
export function usePeekedRecordId(databaseId: string): string | undefined {
  const { documents } = useStores();
  const { search } = useLocation();
  const slug = peekedDocumentSlug(search);
  const document = slug ? documents.get(slug) : undefined;
  return document?.databaseId === databaseId
    ? (document.databaseRecordId ?? undefined)
    : undefined;
}

/**
 * Whether Escape pressed on an element closes the side peek: not while typing or in a menu, a
 * dialog or a table, which use Escape themselves, but from a button outside of a popup, such as
 * the « Open » of a table row.
 *
 * @param target the element the key was pressed on.
 * @returns true when Escape closes the peek.
 */
export function escapeClosesPeek(target: EventTarget | null): boolean {
  if (target instanceof HTMLButtonElement) {
    return !target.closest(POPUP_ROLES);
  }
  return !isKeyboardWidget(target);
}

const POPUP_ROLES = ["menu", "dialog", "alertdialog", "listbox"]
  .map((role) => `[role="${role}"]`)
  .join(",");

/**
 * The share of the split view the main pane keeps beside a side peek: Notion's peek takes half of
 * the window, whatever the sidebar leaves to the main area.
 *
 * @param windowWidth the width of the window.
 * @param mainWidth the width of the main area, which the split view divides.
 * @returns the fraction of the main area left to the main pane.
 */
export function peekSplitRatio(windowWidth: number, mainWidth: number): number {
  return 1 - windowWidth / 2 / mainWidth;
}

/**
 * Opens a row page in the side peek. A peek opening beside a single pane takes Notion's width;
 * one replacing another keeps the width it was given.
 *
 * @param ui the UI store, which holds the split of the view.
 * @param path the path of the row page.
 */
export function openRowPeek(
  ui: Pick<UiStore, "setSplitViewRatio">,
  path: string
): void {
  if (!getSplitPath(browserHistory.location.search)) {
    const main = window.document.querySelector("[role='main']");
    const width = main?.getBoundingClientRect().width;
    if (width) {
      ui.setSplitViewRatio(peekSplitRatio(window.innerWidth, width));
    }
  }
  openRouteInSplit(browserHistory, path);
}

/** Closes the side peek, as Notion's « Close » on the open row does. */
export function closeRowPeek(): void {
  closeSplitPane(browserHistory);
}

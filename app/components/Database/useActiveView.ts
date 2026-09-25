import { useCallback, useMemo } from "react";
import type { DatabaseView } from "@shared/databases/types";
import usePersistedState from "~/hooks/usePersistedState";
import type Database from "~/models/Database";

/**
 * The key under which a reader's active view of a block is remembered.
 *
 * @param blockKey the block's node id, or the database id.
 * @returns the local storage key.
 */
export function activeViewStorageKey(blockKey: string): string {
  return `database:${blockKey}:view`;
}

/**
 * The views a block shows and the one the reader has open. The choice is kept
 * per reader in local storage rather than in the document, so that switching
 * tabs never edits the page and works for readers who cannot edit it.
 *
 * @param database the database, once loaded.
 * @param blockKey the block's node id, or the database id.
 * @param viewIds the views of a linked view, null for all of them.
 * @returns the views, the active one and a function to switch.
 */
export function useActiveView(
  database: Database | undefined,
  blockKey: string,
  viewIds: string[] | null
): {
  views: DatabaseView[];
  activeView: DatabaseView | undefined;
  setActiveViewId: (viewId: string) => void;
} {
  const [storedId, setStoredId] = usePersistedState<string>(
    activeViewStorageKey(blockKey),
    ""
  );

  const allViews = database?.orderedViews;
  const views = useMemo(() => {
    const all = allViews ?? [];
    if (!viewIds?.length) {
      return all;
    }
    const allowed = all.filter((view) => viewIds.includes(view.id));
    return allowed.length ? allowed : all;
  }, [allViews, viewIds]);

  const activeView = views.find((view) => view.id === storedId) ?? views[0];

  const setActiveViewId = useCallback(
    (viewId: string) => setStoredId(viewId),
    [setStoredId]
  );

  return { views, activeView, setActiveViewId };
}

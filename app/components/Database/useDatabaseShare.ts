import * as React from "react";
import useShare from "@shared/hooks/useShare";
import { sharedModelPath } from "~/utils/routeHelpers";

/** How a database block behaves for the reader of a page. */
export interface DatabaseShare {
  /** The share the page is read through, if any. */
  shareId: string | undefined;
  /** Whether the page is read through a public share. */
  isShare: boolean;
  /** A share never edits a database, whatever the reader's own rights. */
  readOnly: boolean;
  /** Row pages open in a side panel only inside the app, not in a share. */
  canOpenInSplit: boolean;
  /** Whether the block may offer a link to `/db/:id`, which needs an account. */
  canLinkToDatabase: boolean;
  /**
   * Returns where a row's page opens: under the share when the page is read
   * through one, so that the reader stays in it.
   *
   * @param documentPath the row page's own path.
   * @returns the path to navigate to.
   */
  rowPath(documentPath: string): string;
}

/**
 * Returns how a database block behaves in the page it is drawn in. Through a
 * public share the block is read-only and its API calls carry the share id,
 * which the API client adds to every request while a share is open.
 *
 * @returns the block's share behaviour.
 */
export function useDatabaseShare(): DatabaseShare {
  const { shareId, isShare } = useShare();

  return React.useMemo(
    () => ({
      shareId,
      isShare,
      readOnly: isShare,
      canOpenInSplit: !isShare,
      canLinkToDatabase: !isShare,
      rowPath: (documentPath: string) =>
        shareId ? sharedModelPath(shareId, documentPath) : documentPath,
    }),
    [shareId, isShare]
  );
}

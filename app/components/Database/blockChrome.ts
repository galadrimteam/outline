/** How a database block lays out its name and its tabs. */
export interface BlockChrome {
  /** Whether the database name is drawn. */
  showHeading: boolean;
  /** Whether the name has a row of its own above the tabs, rather than taking their place. */
  headingAbove: boolean;
}

/**
 * Lays a database block out like Notion. A full-page database takes the name
 * of its page. Inside a page, the name shows unless the block hides it; with
 * several views it gets its own row above the tabs, with a single one no tab
 * is drawn and the name takes its place. A block whose name is hidden shows
 * its tabs, even a single one. The tabs and the toolbar are always in sight.
 *
 * @param options whether the block is full page, hides its name, and how many views it shows.
 * @returns the layout.
 */
export function blockChrome({
  fullPage,
  hideTitle,
  viewCount,
}: {
  fullPage: boolean;
  hideTitle: boolean;
  viewCount: number;
}): BlockChrome {
  const showHeading = !fullPage && !hideTitle;
  return {
    showHeading,
    headingAbove: showHeading && viewCount > 1,
  };
}

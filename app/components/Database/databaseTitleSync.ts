/** What a database block has to say about the title of its database. */
export interface TitleSyncInput {
  /** Whether the block draws its database as the whole page. */
  fullPage: boolean;
  /** The title of the page holding the block, undefined when unknown. */
  pageTitle: string | undefined;
  /** The title of the database. */
  databaseTitle: string;
  /** The `title` attribute of the block's node. */
  nodeTitle: string | null;
}

/** The writes that bring the titles in line. */
export interface TitleSync {
  /** The new title of the database, when it must be renamed. */
  rename?: string;
  /** The new `title` attribute of the node, when it is out of date. */
  nodeTitle?: string | null;
}

/**
 * Brings a database block's titles in line. A full-page database has no title
 * of its own, as in Notion: it takes its page's (an untitled page leaves it
 * alone). The node keeps the database's current title, which exports and
 * links show.
 *
 * @param input the titles as they are.
 * @returns the writes to make, none when everything agrees.
 */
export function titleSync({
  fullPage,
  pageTitle,
  databaseTitle,
  nodeTitle,
}: TitleSyncInput): TitleSync {
  const pageName = pageTitle?.trim().slice(0, MAX_TITLE_LENGTH);
  const rename =
    fullPage && pageName && pageName !== databaseTitle ? pageName : undefined;
  const title = databaseTitle || null;
  return {
    ...(rename ? { rename } : {}),
    ...(title !== nodeTitle ? { nodeTitle: title } : {}),
  };
}

const MAX_TITLE_LENGTH = 255;

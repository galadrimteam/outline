import * as React from "react";
import { useEditor } from "~/editor/components/EditorContext";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { titleSync } from "./databaseTitleSync";

/**
 * Keeps a database block's titles in line (see `titleSync`): a full-page
 * database follows its page's title, and the node follows the database's.
 *
 * @param options the block's database, node title and rights.
 */
export function useDatabaseTitleSync({
  database,
  fullPage,
  nodeTitle,
  canRename,
  setNodeTitle,
}: Options) {
  const editor = useEditor();
  const { databases, documents } = useStores();
  const pageId = editor.props?.id;
  const pageTitle = pageId ? documents.get(pageId)?.title : undefined;
  const databaseId = database?.id;
  const sync = database
    ? titleSync({
        fullPage,
        pageTitle,
        databaseTitle: database.title,
        nodeTitle,
      })
    : {};

  React.useEffect(() => {
    if (!databaseId || !sync.rename || !canRename) {
      return;
    }
    const title = sync.rename;
    const timer = setTimeout(() => {
      databases.update(databaseId, { title }).catch(() => undefined);
    }, RENAME_DELAY);
    return () => clearTimeout(timer);
  }, [canRename, databaseId, databases, sync.rename]);

  React.useEffect(() => {
    if (sync.nodeTitle !== undefined) {
      setNodeTitle(sync.nodeTitle);
    }
  }, [setNodeTitle, sync.nodeTitle]);
}

interface Options {
  /** The block's database, undefined until it is loaded. */
  database: Database | undefined;
  fullPage: boolean;
  /** The `title` attribute of the block's node. */
  nodeTitle: string | null;
  /** Whether the reader may rename the database. */
  canRename: boolean;
  /** Writes the node's title; does nothing in a read-only document. */
  setNodeTitle: (title: string | null) => void;
}

/** How long the page title must stay unchanged before a full-page database takes it. */
const RENAME_DELAY = 500;

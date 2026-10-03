import type { JSONValue, ProsemirrorData } from "@shared/types";

/** What a `database` node pointing at a copied database points at instead. */
export interface DatabaseNodeCopy {
  /** The copy. */
  databaseId: string;
  /** Engine id of each view of the copy, keyed by the id of its source view. */
  viewIds: Record<string, string>;
  /** The title of the copy, written on the node for text exports. */
  title?: string;
}

/**
 * Lists the databases the `database` nodes of a document show, at any depth.
 *
 * @param doc the document as JSON.
 * @returns the database ids, each once.
 */
export function databaseIdsIn(doc: ProsemirrorData): string[] {
  const ids = new Set<string>();
  const visit = (node: ProsemirrorData) => {
    const databaseId = node.attrs?.databaseId;
    if (node.type === "database" && typeof databaseId === "string") {
      ids.add(databaseId);
    }
    node.content?.forEach(visit);
  };
  visit(doc);
  return [...ids];
}

/**
 * Whether a document shows a database as its whole page.
 *
 * @param doc the document as JSON.
 * @param databaseId the database.
 * @returns true when one of its `database` nodes is full page.
 */
export function showsAsFullPage(
  doc: ProsemirrorData,
  databaseId: string
): boolean {
  const visit = (node: ProsemirrorData): boolean =>
    (node.type === "database" &&
      node.attrs?.databaseId === databaseId &&
      node.attrs?.fullPage === true) ||
    !!node.content?.some(visit);
  return visit(doc);
}

/**
 * Writes a database's title on its `database` nodes, which text exports show.
 *
 * @param doc the document as JSON.
 * @param databaseId the database.
 * @param title its title.
 * @returns the rewritten document (the input itself when nothing changed) and
 * the number of nodes rewritten.
 */
export function retitleDatabaseNodes(
  doc: ProsemirrorData,
  databaseId: string,
  title: string
): { doc: ProsemirrorData; rewritten: number } {
  let rewritten = 0;
  const visit = (node: ProsemirrorData): ProsemirrorData => {
    const content = node.content?.map(visit);
    const next =
      content && content.some((child, index) => child !== node.content?.[index])
        ? { ...node, content }
        : node;
    if (
      node.type !== "database" ||
      node.attrs?.databaseId !== databaseId ||
      node.attrs?.title === title
    ) {
      return next;
    }
    rewritten += 1;
    return { ...next, attrs: { ...node.attrs, title } };
  };
  const result = visit(doc);
  return { doc: rewritten ? result : doc, rewritten };
}

/**
 * Points the `database` nodes of a document at copied databases, with the
 * views of the copies. A linked view keeps only the views that were copied.
 *
 * @param doc the document as JSON.
 * @param copies the copy of each database, keyed by the source database id.
 * @returns the rewritten document (the input itself when nothing changed) and
 * the number of nodes rewritten.
 */
export function rewriteDatabaseNodes(
  doc: ProsemirrorData,
  copies: Map<string, DatabaseNodeCopy>
): { doc: ProsemirrorData; rewritten: number } {
  let rewritten = 0;
  const visit = (node: ProsemirrorData): ProsemirrorData => {
    const databaseId = node.attrs?.databaseId;
    const copy =
      node.type === "database" && typeof databaseId === "string"
        ? copies.get(databaseId)
        : undefined;
    const content = node.content?.map(visit);
    const contentChanged =
      !!content &&
      content.some((child, index) => child !== node.content?.[index]);

    if (!copy) {
      return contentChanged ? { ...node, content } : node;
    }
    rewritten += 1;
    return {
      ...node,
      ...(content ? { content } : {}),
      attrs: {
        ...node.attrs,
        databaseId: copy.databaseId,
        viewIds: copiedViewIds(node.attrs?.viewIds, copy.viewIds),
        ...(copy.title !== undefined ? { title: copy.title } : {}),
      },
    };
  };
  const result = visit(doc);
  return { doc: rewritten ? result : doc, rewritten };
}

function copiedViewIds(
  viewIds: JSONValue | undefined,
  copied: Record<string, string>
): string[] | null {
  if (!Array.isArray(viewIds)) {
    return null;
  }
  const mapped = viewIds.flatMap((id) =>
    typeof id === "string" && copied[id] ? [copied[id]] : []
  );
  return mapped.length ? mapped : null;
}

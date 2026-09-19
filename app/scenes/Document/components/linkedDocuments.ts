import { MentionType } from "@shared/types";
import type { ProsemirrorData } from "@shared/types";

/**
 * galadrim: helpers behind the list of references at the bottom of a document.
 * In Notion a sub-page is a block of its parent, so it is only ever listed
 * where the page links to it. Our importer writes those links in the body of
 * the parent, which made the "Documents" tab a second copy of them, and made
 * every parent show up as a backlink of its children.
 */

/** Matches the identifier of a document in the path of an internal url. */
const documentPathRegex = /\/doc\/([^/?#\s]+)/;

/**
 * Returns the url identifier, the part that survives a rename, of a document
 * slug such as "my-title-P5CIiyxfqK".
 *
 * @param slug the slug or bare url identifier of a document.
 * @returns the url identifier.
 */
function urlIdOf(slug: string): string {
  return slug.slice(slug.lastIndexOf("-") + 1);
}

/**
 * Collects the documents a document links to, through mentions and links.
 *
 * @param data the content of the document.
 * @returns a set holding the id of every mentioned document, and the url
 * identifier of every document that is the target of a link.
 */
export function getLinkedDocumentKeys(
  data: ProsemirrorData | undefined | null
): Set<string> {
  const keys = new Set<string>();

  const visit = (node: ProsemirrorData) => {
    if (
      node.type === "mention" &&
      node.attrs?.type === MentionType.Document &&
      typeof node.attrs.modelId === "string"
    ) {
      keys.add(node.attrs.modelId);
    }

    for (const mark of node.marks ?? []) {
      const href = mark.type === "link" ? mark.attrs?.href : undefined;
      const match =
        typeof href === "string" ? documentPathRegex.exec(href) : null;
      if (match) {
        keys.add(urlIdOf(match[1]));
      }
    }

    node.content?.forEach(visit);
  };

  if (data) {
    visit(data);
  }
  return keys;
}

/**
 * Whether a document is among those collected by `getLinkedDocumentKeys`.
 *
 * @param keys the result of `getLinkedDocumentKeys`.
 * @param node the document to look for, its url looks like "/doc/title-urlId".
 * @returns true if the document is mentioned or linked to.
 */
export function isLinkedDocument(
  keys: Set<string>,
  node: { id: string; url?: string }
): boolean {
  if (keys.has(node.id)) {
    return true;
  }
  const match = node.url ? documentPathRegex.exec(node.url) : null;
  return !!match && keys.has(urlIdOf(match[1]));
}

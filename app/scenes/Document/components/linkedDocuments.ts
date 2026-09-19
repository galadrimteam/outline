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
 * Both halves of the path segment of a link are kept: the segment as written,
 * which is the document id when the link was imported (our importer's links are
 * of the form "/doc/<id>", the 48 internal links of the 8 imported parent pages
 * sampled on 2026-09-20 all are), and its url identifier, the part that a
 * rename preserves in the "/doc/<title>-<urlId>" links the editor writes.
 *
 * @param data the content of the document.
 * @returns a set holding the id of every mentioned document, and, for every
 * document that is the target of a link, the path segment of that link and its
 * url identifier.
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
        keys.add(match[1]);
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
  return !!match && (keys.has(match[1]) || keys.has(urlIdOf(match[1])));
}

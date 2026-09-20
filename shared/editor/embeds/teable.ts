import type { ProsemirrorData } from "../../types";

/**
 * galadrim: the URL shape of a Teable base embedded through our /framed
 * wrapper or a public share link. Single source of truth for the "teable"
 * embed descriptor (below) and for the sidebar/references code that treats
 * a document holding one of these as a Notion-style database page — see
 * app/scenes/Document/components/linkedDocuments.ts and
 * app/components/Sidebar/components/SidebarExpansionContext.ts.
 */
export const TEABLE_FRAME_REGEX = new RegExp(
  "^https?://teable\\.[a-z0-9.-]+/(framed\\?.+|share/.+)$"
);

/**
 * galadrim: whether a document's body is (or contains) a Teable base embed,
 * i.e. is a database page imported from a Notion database. Notion never
 * lists a database's rows anywhere but inside the database itself, so a
 * page like this should not repeat them as child documents or backlinks.
 *
 * @param data the document's content.
 * @returns true if any embed node in the tree points at a Teable base.
 */
export function hasDatabaseEmbed(
  data: ProsemirrorData | undefined | null
): boolean {
  if (!data) {
    return false;
  }

  const visit = (node: ProsemirrorData): boolean => {
    if (
      node.type === "embed" &&
      typeof node.attrs?.href === "string" &&
      TEABLE_FRAME_REGEX.test(node.attrs.href)
    ) {
      return true;
    }
    return !!node.content?.some(visit);
  };

  return visit(data);
}

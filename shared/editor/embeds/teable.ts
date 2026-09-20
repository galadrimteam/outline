import type { ProsemirrorData } from "../../types";

/**
 * galadrim: the URL shape of a Teable base embedded through our /framed
 * wrapper or a public share link. Single source of truth for the "teable"
 * embed descriptor (shared/editor/embeds/index.tsx) and for the two
 * navigation surfaces that treat a document holding one as a Notion-style
 * database page — see app/scenes/Document/components/References.tsx and
 * app/components/Sidebar/components/DocumentLink.tsx.
 */
export const TEABLE_FRAME_REGEX = new RegExp(
  "^https?://teable\\.[a-z0-9.-]+/(framed\\?.+|share/.+)$"
);

/**
 * Whether a node is an embed of a Teable base.
 *
 * @param node a node of a document's content.
 * @returns true for an embed pointing at a Teable base.
 */
function isTeableEmbed(node: ProsemirrorData): boolean {
  return (
    node.type === "embed" &&
    typeof node.attrs?.href === "string" &&
    TEABLE_FRAME_REGEX.test(node.attrs.href)
  );
}

/**
 * Whether a node is an empty paragraph, i.e. carries nothing a reader sees.
 * The editor leaves one at the end of a document readily enough that it
 * should not change what the page *is*.
 *
 * @param node a node of a document's content.
 * @returns true for a paragraph with no content.
 */
function isBlank(node: ProsemirrorData): boolean {
  return node.type === "paragraph" && !node.content?.length;
}

/**
 * galadrim: whether a document *is* a database page imported from a Notion
 * database, i.e. its whole body is the embed of its Teable base and nothing
 * else. Notion never lists a database's rows anywhere but inside the database
 * itself, so such a page repeats them neither in its "Documents" tab nor in
 * the sidebar tree.
 *
 * Deliberately not "the body contains a Teable embed somewhere": a Notion page
 * may hold an inline database among its own content, and it is then an
 * ordinary page whose real sub-pages stay listed and unfoldable, exactly as
 * they are in Notion. Measured on the imported corpus (1308 documents): 124
 * documents hold a Teable embed, but all 412 row-documents hang under the 53
 * whose body is only that embed; the wider rule took 41 real sub-pages, and
 * 265 of their descendants, out of both surfaces.
 *
 * @param data the document's content.
 * @returns true if the body is just the embed of a Teable base.
 */
export function isDatabasePage(
  data: ProsemirrorData | undefined | null
): boolean {
  const blocks = data?.content?.filter((node) => !isBlank(node));
  return !!blocks && blocks.length === 1 && isTeableEmbed(blocks[0]);
}

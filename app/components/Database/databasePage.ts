import type { ProsemirrorData } from "@shared/types";

/**
 * Whether a document is nothing but a full-page database, what Notion draws as
 * a database page: blank paragraphs around the block do not count.
 *
 * @param data the document content.
 * @returns true for a database page.
 */
export function isDatabasePage(
  data: ProsemirrorData | null | undefined
): boolean {
  const blocks = (data?.content ?? []).filter((node) => !isBlank(node));
  return (
    blocks.length === 1 &&
    blocks[0].type === "database" &&
    blocks[0].attrs?.fullPage === true
  );
}

function isBlank(node: ProsemirrorData): boolean {
  return (
    node.type === "paragraph" &&
    (node.content ?? []).every(
      (child) => child.type === "text" && !(child.text ?? "").trim()
    )
  );
}

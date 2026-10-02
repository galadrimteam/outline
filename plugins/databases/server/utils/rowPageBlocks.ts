import type { ProsemirrorData } from "@shared/types";

/**
 * Returns the plain text of a node and its descendants.
 *
 * @param node the node.
 * @returns the text.
 */
export function textOf(node: ProsemirrorData): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "br") {
    return "\n";
  }
  return (node.content ?? []).map(textOf).join("");
}

/**
 * Returns the index of the first block of a row page that the migration did not put there as layout: empty
 * paragraphs, and the page's cover (deploy/migrator/pagemeta.py writes Notion's cover as a full-width image on top of
 * the body, Outline having no covers), are passed over.
 *
 * @param blocks the top-level blocks of the page.
 * @returns the index, or the number of blocks when there is nothing else.
 */
export function firstContentIndex(blocks: ProsemirrorData[]): number {
  const index = blocks.findIndex(
    (block) => !isEmptyParagraph(block) && !isCover(block)
  );
  return index === -1 ? blocks.length : index;
}

/**
 * Tells whether a block is a paragraph of text alone (marks and line breaks allowed, no image or mention).
 *
 * @param block the block.
 * @returns true for a non-empty paragraph of text.
 */
export function isTextParagraph(block: ProsemirrorData): boolean {
  return (
    block.type === "paragraph" &&
    (block.content ?? []).every(
      (child) => child.type === "text" || child.type === "br"
    ) &&
    !!textOf(block).trim()
  );
}

function isEmptyParagraph(block: ProsemirrorData): boolean {
  return (
    block.type === "paragraph" &&
    (block.content ?? []).every((child) => child.type !== "image") &&
    !textOf(block).trim()
  );
}

function isCover(block: ProsemirrorData): boolean {
  const children = (block.content ?? []).filter(
    (child) => child.type !== "text" || child.text?.trim()
  );
  return (
    block.type === "paragraph" &&
    children.length === 1 &&
    children[0].type === "image" &&
    children[0].attrs?.layoutClass === "full-width"
  );
}

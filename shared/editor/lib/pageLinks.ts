import type { Node as ProsemirrorNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { MentionType } from "../../types";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";

/**
 * Whether a block is a link to a page on a line of its own, what Notion's « link to page » block
 * becomes: a paragraph holding nothing but a document or collection mention.
 *
 * @param node the block.
 * @returns true for a page link.
 */
export function isPageLink(node: ProsemirrorNode): boolean {
  const child = node.firstChild;
  return (
    node.type.name === "paragraph" &&
    node.childCount === 1 &&
    child?.type.name === "mention" &&
    (child.attrs.type === MentionType.Document ||
      child.attrs.type === MentionType.Collection)
  );
}

/**
 * Marks the page links of a document so that a run of them stays as tight as Notion's list of
 * sub-pages instead of being spaced like paragraphs.
 *
 * @param doc the document.
 * @returns a decoration per top-level page link.
 */
export function pageLinkDecorations(doc: ProsemirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    if (isPageLink(node)) {
      decorations.push(
        Decoration.node(offset, offset + node.nodeSize, {
          class: EditorStyleHelper.pageLink,
        })
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

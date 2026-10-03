/**
 * Attribute of the document's contents panel or of its rail of dashes (scenes/Document), which a
 * database block must not run over.
 */
export const CONTENTS_PANEL_ATTRIBUTE = "data-document-contents";

/** Window event telling the blocks that a contents panel or rail appeared or went. */
export const CONTENTS_CHANGE_EVENT = "outline-document-contents";

/**
 * Tells the database blocks to measure their room again: a rail fixed in the margin changes no
 * size they observe.
 */
export function announceContentsChange() {
  window.dispatchEvent(new Event(CONTENTS_CHANGE_EVENT));
}

/** Room kept between a database block and a contents panel on its right. */
const CONTENTS_GAP = 24;

/**
 * How far a database block may reach right of its text column: up to the edge
 * of the document's content area, as Notion lets a wide database run to the
 * edge of the window while the text keeps its reading width, but not over a
 * contents panel drawn on the right of the text.
 *
 * @param edges the right edge of the block, of the content area, and the left
 * edge of the contents panel when there is one.
 * @returns the width in pixels, never negative.
 */
export function rightBleed({
  blockRight,
  areaRight,
  contentsLeft,
}: {
  blockRight: number;
  areaRight: number;
  contentsLeft?: number;
}): number {
  const edge =
    contentsLeft !== undefined && contentsLeft >= blockRight
      ? Math.min(areaRight, contentsLeft - CONTENTS_GAP)
      : areaRight;
  return Math.max(0, Math.floor(edge - blockRight));
}

/**
 * The content area of the document a block is drawn in: the closest ancestor
 * whose width the document scene publishes as `--container-width`.
 *
 * @param element the block.
 * @returns the content area, undefined outside of a document scene.
 */
export function contentAreaOf(element: HTMLElement): HTMLElement | undefined {
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (ancestor.style.getPropertyValue("--container-width")) {
      return ancestor;
    }
  }
  return undefined;
}

/**
 * Measures {@link rightBleed} for a block in the page.
 *
 * @param block the block.
 * @param area its content area.
 * @returns the width in pixels.
 */
export function measureRightBleed(
  block: HTMLElement,
  area: HTMLElement
): number {
  const areaRect = area.getBoundingClientRect();
  const contents = area.querySelector(`[${CONTENTS_PANEL_ATTRIBUTE}]`);
  return rightBleed({
    blockRight: block.getBoundingClientRect().right,
    // The area's own scrollbar, if any, is not room for the block.
    areaRight: areaRect.left + area.clientLeft + area.clientWidth,
    contentsLeft: contents?.getBoundingClientRect().left,
  });
}

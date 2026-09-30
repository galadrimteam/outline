import { useEffect } from "react";
import { splitDateMentions } from "@shared/utils/dateMention";

/** Name of the CSS highlight holding the date mentions of editable titles. */
export const dateMentionHighlight = "date-mention";

/**
 * Greys the date mentions of an editable title, as Notion does, without touching its text: the
 * ranges go to a CSS custom highlight, styled with `::highlight(date-mention)`, so the caret and
 * the text the title sends stay those of a plain text. Does nothing where the browser has no
 * CSS highlights.
 *
 * @param getElement returns the element holding the title text.
 * @param text the title, whose changes recompute the ranges.
 */
export function useDateMentionHighlight(
  getElement: () => HTMLElement | null | undefined,
  text: string
): void {
  useEffect(() => {
    const highlight = sharedHighlight();
    const element = getElement();
    if (!highlight || !element) {
      return undefined;
    }
    let ranges: Range[] = [];
    const update = () => {
      for (const range of ranges) {
        highlight.delete(range);
      }
      ranges = dateMentionRanges(element);
      for (const range of ranges) {
        highlight.add(range);
      }
    };
    update();
    // The text changes under the caret, and after this effect when the title comes from the
    // server: the ranges follow the element rather than the prop.
    const observer = new MutationObserver(update);
    observer.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      for (const range of ranges) {
        highlight.delete(range);
      }
    };
  }, [getElement, text]);
}

/**
 * The DOM ranges of the date mentions of an element's text.
 *
 * @param element the element.
 * @returns one range per date mention.
 */
export function dateMentionRanges(element: HTMLElement): Range[] {
  const texts: Text[] = [];
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) {
      texts.push(node);
    }
  }

  const locate = (offset: number): [Text, number] | undefined => {
    let start = 0;
    for (const node of texts) {
      if (offset <= start + node.length) {
        return [node, offset - start];
      }
      start += node.length;
    }
    return undefined;
  };

  const ranges: Range[] = [];
  let offset = 0;
  for (const part of splitDateMentions(
    texts.map((node) => node.data).join("")
  )) {
    const from = locate(offset);
    const to = locate(offset + part.text.length);
    offset += part.text.length;
    if (!part.isDate || !from || !to) {
      continue;
    }
    const range = element.ownerDocument.createRange();
    range.setStart(from[0], from[1]);
    range.setEnd(to[0], to[1]);
    ranges.push(range);
  }
  return ranges;
}

let highlight: Highlight | undefined;

function sharedHighlight(): Highlight | undefined {
  if (
    typeof CSS === "undefined" ||
    !("highlights" in CSS) ||
    typeof Highlight === "undefined"
  ) {
    return undefined;
  }
  if (!highlight) {
    highlight = new Highlight();
    CSS.highlights.set(dateMentionHighlight, highlight);
  }
  return highlight;
}

import type { ProsemirrorData } from "@shared/types";
import { DocumentValidation } from "@shared/validations";
import {
  firstContentIndex,
  isTextParagraph,
  textOf,
} from "../utils/rowPageBlocks";

/** A row page as the cleanup reads and writes it. */
export interface RowPage {
  title: string;
  content: ProsemirrorData;
}

/** How a title cut to fit in Outline ends: the migration's ellipsis, or the import's three dots. */
const CutTitle = /(…|\.\.\.)$/;

/**
 * Returns a row page with its whole title, without the paragraphs where the migration had put what the title could
 * not hold. A Notion title is one block of any length, possibly over several lines. The migration cut a title above
 * Outline's former 100 characters and repeated it whole, in bold, on top of the body (deploy/migrator/pagemeta.py),
 * and the lines of a title after its first became paragraphs of their own. The row's title in the database is the
 * whole title: the paragraphs right under the title (after empty ones and the cover) are the title's when, with the
 * page title in front of them or in place of a cut page title, they make exactly the row's title.
 *
 * @param page the page's title and content.
 * @param rowTitle the row's title in the database.
 * @returns the page with the row's title and without those paragraphs, or null when the page has none.
 */
export function withoutRepeatedTitle(
  page: RowPage,
  rowTitle: string
): RowPage | null {
  const title = rowTitle.trim();
  const wanted = normalize(title);
  if (
    !wanted ||
    wanted === normalize(page.title) ||
    title.length > DocumentValidation.maxTitleLength
  ) {
    return null;
  }
  const cut = CutTitle.test(page.title.trim());
  const blocks = page.content.content ?? [];
  const start = firstContentIndex(blocks);
  let lines = "";
  for (let end = start; end < blocks.length; end++) {
    if (!isTextParagraph(blocks[end])) {
      return null;
    }
    lines = normalize(`${lines} ${textOf(blocks[end])}`);
    if (
      normalize(`${page.title} ${lines}`) === wanted ||
      (cut && lines === wanted)
    ) {
      return {
        title,
        content: {
          ...page.content,
          content: blocks.filter(
            (_, position) => position < start || position > end
          ),
        },
      };
    }
    if (lines.length > wanted.length) {
      return null;
    }
  }
  return null;
}

/**
 * Tells whether a row page's body starts with a paragraph of text, which may be lines of its title: only then is the
 * row's title worth reading from the database.
 *
 * @param content the page's content.
 * @returns true when `withoutRepeatedTitle` may find something.
 */
export function mayHoldTitleLines(content: ProsemirrorData): boolean {
  const blocks = content.content ?? [];
  const first = blocks[firstContentIndex(blocks)];
  return !!first && isTextParagraph(first);
}

/** pagemeta.py drops the asterisks of the bold repeat; whitespace is not kept the same by Markdown either. */
function normalize(text: string): string {
  return text.normalize("NFC").replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

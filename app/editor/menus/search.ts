import commandScore from "command-score";
import { deburr } from "es-toolkit/compat";

/** The fields of a menu item that a search looks at. */
export interface SearchableMenuItem {
  name?: string;
  title?: string;
  keywords?: string;
}

/**
 * Whether a menu item answers a search: every word of the search must appear
 * in the item's name, title or keywords, ignoring case and accents, so that
 * « liste a puces » finds « Liste à puces » and « titre 2 » finds an item whose
 * keywords hold « titre » and « 2 ».
 *
 * @param item the menu item.
 * @param search the text typed after the trigger.
 * @returns true when the item should be listed.
 */
export function matchesMenuSearch(
  item: SearchableMenuItem,
  search: string
): boolean {
  const words = normalizeSearchText(search).split(" ").filter(Boolean);
  if (!words.length) {
    return true;
  }
  // A dash standing between words, as in « Base de données - intégrée », is
  // not something to find, unless it is all that was typed (« --- »).
  const meaningful = words.filter((word) => /[\p{L}\p{N}]/u.test(word));

  const haystack = normalizeSearchText(
    [item.name, item.title, item.keywords].filter(Boolean).join(" ")
  );
  return (meaningful.length ? meaningful : words).every((word) =>
    haystack.includes(word)
  );
}

/**
 * How well a menu item answers a search, higher first. The exact title comes
 * first, then an exact keyword, the way Notion's « /h1 », « /todo » or « /db »
 * name one block, then a fuzzy match on the title. An embed falls behind a
 * block of the editor that answers as well, as Notion lists its embeds last,
 * unless it is named exactly.
 *
 * @param item the menu item.
 * @param search the text typed after the trigger.
 * @param options whether the item is an embed.
 * @returns the score, 0 when there is nothing to compare.
 */
export function menuSearchScore(
  item: SearchableMenuItem,
  search: string,
  options: { embed?: boolean } = {}
): number {
  const query = normalizeSearchText(search);
  if (!query) {
    return 0;
  }

  const title = normalizeSearchText(item.title ?? "");
  const keywords = normalizeSearchText(item.keywords ?? "").split(" ");
  const exact =
    title === query ? 2 : keywords.includes(query.replace(/ /g, "")) ? 1 : 0;

  return (
    exact + (title ? commandScore(title, query) : 0) - (options.embed ? 1 : 0)
  );
}

/**
 * Lower-cases a text, strips its accents and collapses its whitespace, so that
 * what a French keyboard types compares equal to the same word written with
 * or without accents.
 *
 * @param text the text to normalize.
 * @returns the normalized text.
 */
export function normalizeSearchText(text: string): string {
  return deburr(text)
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

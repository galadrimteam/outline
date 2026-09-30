/** A part of a text: plain, or a date mention that Notion draws in grey. */
export interface DateMentionPart {
  text: string;
  isDate: boolean;
}

const frenchMonths =
  "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const englishMonths =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const time = "(?: \\d{1,2}:\\d{2}(?: ?[AP]M)?)?";
const day = `(?:\\d{1,2} (?:${frenchMonths}) \\d{4}|(?:${englishMonths}) \\d{1,2}, \\d{4})${time}`;
const mention = new RegExp(`@${day}(?: → ${day})?`, "giu");

/**
 * Splits a text around its date mentions. A title keeps a Notion date mention as text, the way
 * the migration and Notion's export write it: « @25 août 2026 », « @3 décembre 2025 14:00 →
 * 5 décembre 2025 », « @December 3, 2025 ».
 *
 * @param text the text, a page or row title.
 * @returns the parts in order, one part when there is no date mention.
 */
export function splitDateMentions(text: string): DateMentionPart[] {
  const parts: DateMentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(mention)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({ text: text.slice(last, start), isDate: false });
    }
    parts.push({ text: match[0], isDate: true });
    last = start + match[0].length;
  }
  if (last < text.length || !parts.length) {
    parts.push({ text: text.slice(last), isDate: false });
  }
  return parts;
}

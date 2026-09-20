const escapes: [RegExp, string][] = [
  [/\\/g, "\\\\"],
  [/\*/g, "\\*"],
  [/^-/g, "\\-"],
  [/^\+ /g, "\\+ "],
  [/^(=+)/g, "\\$1"],
  [/^(#{1,6}) /g, "\\$1 "],
  [/`/g, "\\`"],
  [/^~~~/g, "\\~~~"],
  [/\[/g, "\\["],
  [/\]/g, "\\]"],
  [/\(/g, "\\("], // OLN-91
  [/\)/g, "\\)"], // OLN-91
  [/^>/g, "\\>"],
  [/_/g, "\\_"],
  [/^(\d+)\. /g, "$1\\. "],
  [/\$/g, "\\$"],
];

/**
 * Escape markdown characters in a string
 *
 * @param text - The text to escape
 * @returns The escaped text
 */
export const escape = function (text: string) {
  return escapes.reduce(function (accumulator, esc) {
    return accumulator.replace(esc[0], esc[1]);
  }, text);
};

/**
 * Unescape markdown characters in a string
 *
 * @param text - The text to unescape
 * @returns The unescaped text
 */
export const unescape = function (text: string) {
  return text.replace(/\\([\\*+-\d.])/g, "$1");
};

/**
 * Matches the start of a markdown link or image, up to and including the
 * parenthesis that opens its destination.
 *
 * galadrim: where that destination ends is decided by `findDestinationEnd`,
 * not by this pattern. Upstream stopped at the first ")", so a destination
 * holding parentheses — as Notion writes them, "[Page](Folder/Page%20(v2).md)"
 * — was cut short and the link stayed a dead relative link.
 */
const linkStartRegex = /!?\[[^\]]*\]\(/;

/**
 * galadrim: finds the parenthesis that closes a link's destination.
 *
 * Parentheses inside the destination are counted, as CommonMark asks, so that
 * "Folder/Page%20(v2).md" is read whole. When they do not balance, the first
 * ")" closes the link instead, which is what upstream always did: Notion cuts
 * long page and file names at a fixed length and the cut often falls inside a
 * parenthesis, leaving an opening one with no closing one — 6 links of
 * Galadrim's export, every one of them pointing at a real exported file.
 *
 * @param text The markdown being rewritten.
 * @param open Index of the first character of the destination.
 * @returns Index of the closing parenthesis, or -1 when there is none.
 */
function findDestinationEnd(text: string, open: number): number {
  let depth = 1;
  let firstClose = -1;

  for (let i = open; i < text.length; i++) {
    const char = text[i];
    // A destination never spans lines; without this, an unbalanced "(" would
    // let the search run on and swallow whole paragraphs.
    if (char === "\n") {
      break;
    }
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      if (firstClose === -1) {
        firstClose = i;
      }
      if (--depth === 0) {
        return i;
      }
    }
  }

  return firstClose;
}

/**
 * Replaces the destination of every markdown link and image in a string.
 *
 * Understands the angle-bracket form used when a destination contains spaces,
 * and preserves any link title.
 *
 * @param text The markdown text to rewrite.
 * @param replace Called with each destination; return the replacement, or
 *   undefined to leave the link as it was written.
 * @returns The markdown with replaced destinations.
 */
export function replaceMarkdownLinks(
  text: string,
  replace: (href: string) => string | undefined
): string {
  let result = "";
  // Everything before this index has been written to the result already.
  let written = 0;
  // A copy of the pattern per call: the scan keeps its place in `lastIndex`,
  // and `replace` may well rewrite markdown of its own along the way.
  const linkStart = new RegExp(linkStartRegex.source, "g");

  for (let match = linkStart.exec(text); match; match = linkStart.exec(text)) {
    const open = match.index + match[0].length;
    // A link start found inside a destination already consumed is not one.
    if (match.index < written) {
      continue;
    }

    const close = findDestinationEnd(text, open);
    if (close === -1) {
      continue;
    }
    // Carry on looking after the link, not inside its destination.
    linkStart.lastIndex = close;

    const target = text.slice(open, close);
    const leading = target.length - target.trimStart().length;
    const trimmed = target.trim();

    let href: string;
    let title: string;

    if (trimmed.startsWith("<")) {
      const end = trimmed.indexOf(">");
      if (end === -1) {
        continue;
      }
      href = trimmed.slice(1, end);
      title = target.slice(leading + end + 1);
    } else {
      [href] = trimmed.split(/\s/, 1);
      if (!href) {
        continue;
      }
      title = target.slice(leading + href.length);
    }

    const replacement = replace(href);
    if (replacement === undefined) {
      continue;
    }

    result += text.slice(written, open) + replacement + title;
    written = close;
  }

  return result + text.slice(written);
}

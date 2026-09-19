import { escapeRegExp } from "es-toolkit/compat";

/**
 * galadrim: the search ignores accents (see SEARCH_CONFIGURATION), so the
 * excerpt shown under a result has to find and highlight "Sécurité" for the
 * query "securite", and the other way round.
 */
const variants: Record<string, string> = {
  a: "aàáâãäå",
  c: "cç",
  e: "eèéêë",
  i: "iìíîï",
  n: "nñ",
  o: "oòóôõö",
  u: "uùúûü",
  y: "yýÿ",
};

/**
 * Build the source of a regular expression that matches the text whatever the
 * accents, in the text or in what it is matched against.
 *
 * @param text the literal text to match.
 * @returns an escaped regular expression source.
 */
export function accentInsensitivePattern(text: string): string {
  const folded = text.normalize("NFD").replace(/[̀-ͯ]/g, "");

  return escapeRegExp(folded).replace(
    /[aceinouy]/gi,
    (char) => `[${variants[char.toLowerCase()]}]`
  );
}

/** Letters and digits, accented Latin letters included (`\b` only knows ASCII). */
const wordChar = "[A-Za-z0-9À-ÖØ-öø-ÿ]";

/**
 * Same as accentInsensitivePattern, matching whole words only. Used in place
 * of `\b…\b`, which never matches a word that starts or ends with an accented
 * letter ("été", "sécurité").
 *
 * @param word the literal word to match.
 * @returns an escaped regular expression source.
 */
export function accentInsensitiveWordPattern(word: string): string {
  return `(?<!${wordChar})${accentInsensitivePattern(word)}(?!${wordChar})`;
}

import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { EmbedDescriptor } from "../embeds";

function isParagraphOpen(token: Token | undefined) {
  return token?.type === "paragraph_open";
}

function isParagraphClose(token: Token | undefined) {
  return token?.type === "paragraph_close";
}

/**
 * A markdown-it rule that converts a paragraph containing nothing but a link
 * whose text is its own url, eg `[https://…](https://…)`, into an embed when
 * the url matches one of the embeds that are enabled for matching on input.
 *
 * @param getEmbeds a function returning the embed descriptors to match against.
 * @returns the markdown-it plugin.
 */
export default function linksToEmbeds(getEmbeds: () => EmbedDescriptor[]) {
  function isEmbed(href: string) {
    for (const embed of getEmbeds()) {
      if (!embed.matchOnInput || embed.disabled) {
        continue;
      }
      if (embed.matcher(href)) {
        return true;
      }
    }

    return false;
  }

  return function markdownEmbeds(md: MarkdownIt) {
    md.core.ruler.after("inline", "embeds", (state) => {
      const tokens = state.tokens;

      for (let i = 1; i < tokens.length - 1; i++) {
        if (
          tokens[i].type !== "inline" ||
          !isParagraphOpen(tokens[i - 1]) ||
          !isParagraphClose(tokens[i + 1]) ||
          // Only top level paragraphs, the embed node is not valid everywhere.
          tokens[i - 1].level !== 0
        ) {
          continue;
        }

        // The link must be the only content of the paragraph.
        const children = tokens[i].children ?? [];
        if (
          children.length !== 3 ||
          children[0].type !== "link_open" ||
          children[1].type !== "text" ||
          children[2].type !== "link_close"
        ) {
          continue;
        }

        const href = children[0].attrGet("href") ?? "";
        const content = children[1].content;

        if (!href || href !== md.normalizeLink(content) || !isEmbed(href)) {
          continue;
        }

        const token = new state.Token("embed", "iframe", 0);
        token.attrSet("href", href);

        // Replace the paragraph_open, inline and paragraph_close tokens.
        tokens.splice(i - 1, 3, token);
        i--;
      }

      return false;
    });
  };
}

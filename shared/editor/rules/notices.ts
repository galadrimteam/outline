import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";
import customFence from "markdown-it-container";
import { splitLeadingEmoji } from "../../utils/parseTitle";

/**
 * galadrim: what the opening line of a notice says — the style name and, when
 * there is one, the emoji that Notion shows at the left of a callout.
 */
export type NoticeInfo = {
  /** The raw style name written after the fence, e.g. "info" or "gray". */
  style: string;
  /** The callout's emoji, shown in place of the style's icon. */
  icon?: string;
};

const OPEN_TOKEN = "container_notice_open";

/**
 * galadrim: reads the opening line of a notice, `:::info` or `:::info 💡`.
 *
 * @param info The token's `info`, everything written after the fence.
 * @returns The style name and the emoji that follows it, if any.
 */
export function parseNoticeInfo(info: string | undefined): NoticeInfo {
  const [first = "", ...rest] = (info ?? "").trim().split(/\s+/);

  // A fence whose first word is an emoji, ":::💡", names no style: the emoji is
  // the icon and the callout is Notion's plain one. Reading the emoji as a
  // style name would drop it, from the node and from the Markdown written back.
  const leading = splitLeadingEmoji(first);
  if (leading.emoji && !leading.rest) {
    return { style: "", icon: leading.emoji };
  }

  const { emoji } = splitLeadingEmoji(rest.join(" "));
  return { style: first, icon: emoji };
}

/**
 * galadrim: reads a notice's style and emoji from its opening token.
 *
 * @param token The `container_notice_open` token.
 * @returns The style name and the emoji, if any.
 */
export function noticeInfo(token: Token): NoticeInfo {
  return (
    (token.meta as { notice?: NoticeInfo } | undefined)?.notice ??
    parseNoticeInfo(token.info)
  );
}

/**
 * galadrim: takes the emoji that leads a notice's first block out of the
 * content. Notion's Markdown export writes a callout's icon as the first
 * character of its text — on a line of its own whenever the text does not
 * start with a plain word — so without this the icon is shown as content,
 * beside the notice's own icon and often alone on a first line.
 *
 * The first block is a heading in a fifth of the callouts our importer writes:
 * a callout whose text starts with a heading has no paragraph to carry the icon
 * and the importer puts it inside the heading, "### 💡 Context". Notion shows
 * that emoji as the callout's icon and the heading without it.
 *
 * @param tokens The block token stream, edited in place.
 * @param index Index of the `container_notice_open` token.
 * @returns The emoji, when one led the first block.
 */
function takeLeadingEmoji(tokens: Token[], index: number): string | undefined {
  const [open, inline, close] = tokens.slice(index + 1, index + 4);
  const block =
    open?.type === "paragraph_open"
      ? "paragraph"
      : open?.type === "heading_open"
        ? "heading"
        : undefined;
  if (!block || inline?.type !== "inline" || close?.type !== `${block}_close`) {
    return undefined;
  }

  const children = inline.children;
  const first = children?.[0];
  if (!children || first?.type !== "text") {
    return undefined;
  }

  const { emoji, rest } = splitLeadingEmoji(first.content);
  if (!emoji) {
    return undefined;
  }

  first.content = rest;
  inline.content = inline.content.slice(emoji.length).trim();

  if (!rest) {
    // The emoji was alone in its text token: drop it, and with it the line
    // break that separated it from the rest of the paragraph.
    children.shift();
    // ("br" is what the breaks rule makes of a hard break, and it may have run
    // before this one.)
    if (["softbreak", "hardbreak", "br"].includes(children[0]?.type)) {
      children.shift();
    }
  }

  if (!children.length) {
    // The block held nothing but the emoji, remove it entirely. A notice left
    // with no content at all is filled with an empty paragraph, which is what
    // the content expression of the node begins with (Notice.tsx).
    tokens.splice(index + 1, 3);
  }

  return emoji;
}

/**
 * galadrim: stores each notice's style and emoji on its opening token and
 * lifts that emoji out of the content.
 *
 * @param state The markdown-it core state.
 */
function noticeIcons(state: StateCore) {
  const tokens = state.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== OPEN_TOKEN) {
      continue;
    }

    const info = parseNoticeInfo(token.info);
    info.icon = info.icon ?? takeLeadingEmoji(tokens, i);
    token.meta = { ...(token.meta as object), notice: info };
  }
}

export default function notice(md: MarkdownIt): void {
  // galadrim: runs after "inline" so that the paragraphs of a notice already
  // have their children, as the checkboxes rule does.
  md.core.ruler.after("inline", "notice_icons", noticeIcons);

  return customFence(md, "notice", {
    marker: ":",
    validate: () => true,
    render(tokens: Token[], idx: number) {
      if (tokens[idx].nesting === 1) {
        // opening tag
        const { style, icon } = noticeInfo(tokens[idx]);
        // galadrim: the emoji is rendered as the icon, see Notice.tsx
        const iconHtml = icon
          ? `<div class="icon">${md.utils.escapeHtml(icon)}</div>\n`
          : "";
        return `<div class="notice notice-${md.utils.escapeHtml(style)}">\n${iconHtml}`;
      } else {
        // closing tag
        return "</div>\n";
      }
    },
  });
}

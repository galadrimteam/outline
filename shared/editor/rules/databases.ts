import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

/**
 * A database link, eg "/db/0c440212-8b40-49fa-8a64-2548d6b60d59", optionally
 * followed by the block's settings as a query string.
 */
export const databasePathRegex =
  /^\/db\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?([^#]*))?$/i;

/** The settings of a database block that its markdown link carries. */
export interface DatabaseLinkSettings {
  databaseId: string;
  viewIds: string[] | null;
  fullPage: boolean;
  legacyHref: string | null;
}

/**
 * Writes the link of a database block, keeping its settings in the query
 * string so that a markdown round trip (`documents.update` with `text`) does
 * not lose them: `/db/<id>?views=<v1>,<v2>&full=1&from=<legacy url>`.
 *
 * @param settings the block's settings.
 * @returns the link, bare when no setting differs from the default.
 */
export function databaseHref(settings: DatabaseLinkSettings): string {
  const params: string[] = [];
  if (settings.viewIds?.length) {
    params.push(`views=${settings.viewIds.map(encodeParam).join(",")}`);
  }
  if (settings.fullPage) {
    params.push("full=1");
  }
  if (settings.legacyHref) {
    params.push(`from=${encodeParam(settings.legacyHref)}`);
  }
  const path = `/db/${settings.databaseId}`;
  return params.length ? `${path}?${params.join("&")}` : path;
}

/**
 * Reads a database link written by `databaseHref`.
 *
 * @param href the link.
 * @returns the settings, undefined when the link is not a database link.
 */
export function parseDatabaseHref(
  href: string
): DatabaseLinkSettings | undefined {
  const match = href.match(databasePathRegex);
  if (!match) {
    return undefined;
  }

  const params = new URLSearchParams(match[2] ?? "");
  const views = (params.get("views") ?? "").split(",").filter(Boolean);
  return {
    databaseId: match[1].toLowerCase(),
    viewIds: views.length ? views : null,
    fullPage: params.get("full") === "1",
    legacyHref: params.get("from") || null,
  };
}

/**
 * A markdown-it rule that turns a top-level paragraph holding nothing but a
 * link to `/db/<uuid>` into a `database` token, the markdown form of a
 * database block. The link text is kept as the block's title.
 *
 * @param md the markdown-it instance.
 */
export default function databases(md: MarkdownIt) {
  md.core.ruler.after("inline", "databases", (state) => {
    const tokens = state.tokens;

    for (let i = 1; i < tokens.length - 1; i++) {
      if (
        tokens[i].type !== "inline" ||
        !isParagraphOpen(tokens[i - 1]) ||
        !isParagraphClose(tokens[i + 1]) ||
        tokens[i - 1].level !== 0
      ) {
        continue;
      }

      const children = tokens[i].children ?? [];
      const first = children[0];
      const last = children[children.length - 1];
      const inner = children.slice(1, -1);
      if (
        children.length < 2 ||
        first.type !== "link_open" ||
        last.type !== "link_close" ||
        !inner.every((child) => child.type === "text")
      ) {
        continue;
      }

      const settings = parseDatabaseHref(first.attrGet("href") ?? "");
      if (!settings) {
        continue;
      }

      const token = new state.Token("database", "a", 0);
      token.attrSet("databaseId", settings.databaseId);
      token.attrSet("viewIds", settings.viewIds?.join(",") ?? "");
      token.attrSet("fullPage", settings.fullPage ? "true" : "");
      token.attrSet("legacyHref", settings.legacyHref ?? "");
      token.attrSet("title", inner.map((child) => child.content).join(""));

      tokens.splice(i - 1, 3, token);
      i--;
    }

    return false;
  });
}

/** Encodes a query value, parentheses included, as they would end the markdown link. */
function encodeParam(value: string) {
  return encodeURIComponent(value).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function isParagraphOpen(token: Token | undefined) {
  return token?.type === "paragraph_open";
}

function isParagraphClose(token: Token | undefined) {
  return token?.type === "paragraph_close";
}

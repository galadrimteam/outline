import { v4 as uuidv4 } from "uuid";
import type { ProsemirrorData } from "@shared/types";

/** The Teable view a URL points to. */
export interface TeableViewRef {
  /** The Teable base id. */
  baseId: string;
  /** The Teable table id. */
  tableId: string;
  /** The Teable view id, when the URL names one. */
  viewId: string | null;
}

/** How the migration asks the block of an embed to look, from the query string of the `/framed` wrapper. */
export interface TeableBlockSettings {
  /**
   * The views the block shows, in tab order (`views=viw1,viw2`): the views of
   * the Notion block, which may be fewer than the table's. Null when the URL
   * does not list them.
   */
  blockViewIds: string[] | null;
  /** Whether the block hides the database name (`notitle=1`), as Notion's block did. */
  hideTitle: boolean;
}

/** A Teable embed found in a Prosemirror document. */
export interface TeableEmbed extends TeableViewRef, TeableBlockSettings {
  /** The URL of the embed. */
  href: string;
  /** Whether the embed is the only content of the document: a full-page database. */
  fullPage: boolean;
  /** The text of the heading right before the embed, if any. */
  heading: string | null;
}

/** The Outline database a Teable embed resolves to. */
export interface ResolvedDatabase {
  /** The id of the Outline database. */
  databaseId: string;
  /** The title of the database, written on the node for text exports. */
  title?: string | null;
}

/** The result of {@link convertTeableEmbeds}. */
export interface TeableEmbedsConversion {
  /** The converted document, the input itself when nothing changed. */
  doc: ProsemirrorData;
  /** The number of embeds replaced by database nodes. */
  converted: number;
}

/**
 * Parses the URL of a Teable embed: the `/framed?u=/base/…` wrapper Outline
 * embeds, or a direct link to a view. Only hosts served from a "teable."
 * subdomain are accepted, like the Teable embed descriptor.
 *
 * @param href the URL of the embed.
 * @returns the base, table and view ids, or null when the URL is not a Teable view.
 */
export function parseTeableHref(href: string): TeableViewRef | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    !TeableHost.test(url.hostname)
  ) {
    return null;
  }

  const isWrapper = url.pathname.replace(/\/+$/, "") === "/framed";
  const path = isWrapper ? url.searchParams.get("u") : url.pathname;
  if (!path) {
    return null;
  }

  const match = ViewPath.exec(path.split(/[?#]/)[0]);
  if (!match) {
    return null;
  }

  return { baseId: match[1], tableId: match[2], viewId: match[3] ?? null };
}

/**
 * Reads the block settings the migration writes next to the wrapped path of a
 * Teable embed: `/framed?u=/base/…/viw1&views=viw1,viw2&notitle=1`.
 *
 * @param href the URL of the embed.
 * @returns the settings; no view list and a shown title when the URL has none.
 */
export function parseTeableBlockSettings(href: string): TeableBlockSettings {
  let params: URLSearchParams;
  try {
    params = new URL(href).searchParams;
  } catch {
    return { blockViewIds: null, hideTitle: false };
  }
  const views = (params.get("views") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => ViewId.test(id));
  return {
    blockViewIds: views.length ? [...new Set(views)] : null,
    hideTitle: params.get("notitle") === "1",
  };
}

/**
 * Lists the Teable embeds of a Prosemirror document, at any depth.
 *
 * @param doc the document as JSON.
 * @returns the embeds, in document order.
 */
export function findTeableEmbeds(doc: ProsemirrorData): TeableEmbed[] {
  const embeds: TeableEmbed[] = [];
  mapTeableEmbeds(doc, (embed) => {
    embeds.push(embed);
    return null;
  });
  return embeds;
}

/**
 * Replaces every Teable embed that resolves to an Outline database with a
 * `database` node, leaving the rest of the document untouched. The embed URL
 * is kept in `legacyHref` so that the conversion can be reverted.
 *
 * @param doc the document as JSON.
 * @param resolve returns the database of an embed, or null to leave the embed as it is.
 * @param createId returns the id of a new database node.
 * @returns the converted document and the number of embeds replaced.
 */
export function convertTeableEmbeds(
  doc: ProsemirrorData,
  resolve: (embed: TeableEmbed) => ResolvedDatabase | null,
  createId: () => string = uuidv4
): TeableEmbedsConversion {
  let converted = 0;
  const result = mapTeableEmbeds(doc, (embed) => {
    const database = resolve(embed);
    if (!database) {
      return null;
    }
    converted += 1;
    return {
      type: "database",
      attrs: {
        id: createId(),
        databaseId: database.databaseId,
        viewIds:
          embed.blockViewIds ??
          (embed.fullPage || !embed.viewId ? null : [embed.viewId]),
        fullPage: embed.fullPage,
        hideTitle: embed.hideTitle,
        legacyHref: embed.href,
        title: database.title || null,
      },
    };
  });
  return { doc: result, converted };
}

// Teable ids are a three-letter prefix followed by alphanumerics. Older
// Teable URLs have no "table/" segment.
const ViewPath =
  /^\/base\/(bse[A-Za-z0-9]+)\/(?:table\/)?(tbl[A-Za-z0-9]+)(?:\/(viw[A-Za-z0-9]+))?\/?$/;

const TeableHost = /^teable\./i;

const ViewId = /^viw[A-Za-z0-9]+$/;

function mapTeableEmbeds(
  node: ProsemirrorData,
  replace: (embed: TeableEmbed) => ProsemirrorData | null
): ProsemirrorData {
  if (!node.content) {
    return node;
  }

  let changed = false;
  const content = node.content.map((child, index) => {
    const embed = describeEmbed(node, index);
    const next = embed ? replace(embed) : mapTeableEmbeds(child, replace);
    if (next && next !== child) {
      changed = true;
      return next;
    }
    return child;
  });

  return changed ? { ...node, content } : node;
}

function describeEmbed(
  parent: ProsemirrorData,
  index: number
): TeableEmbed | null {
  const siblings = parent.content ?? [];
  const node = siblings[index];
  const href =
    node.type === "embed" && typeof node.attrs?.href === "string"
      ? node.attrs.href
      : soleLinkHref(node);
  if (!href) {
    return null;
  }

  const ref = parseTeableHref(href);
  if (!ref) {
    return null;
  }

  return {
    ...ref,
    ...parseTeableBlockSettings(href),
    href,
    fullPage:
      parent.type === "doc" &&
      siblings.every((sibling, i) => i === index || isBlank(sibling)),
    heading: headingBefore(siblings, index),
  };
}

function headingBefore(
  siblings: ProsemirrorData[],
  index: number
): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const sibling = siblings[i];
    if (isBlank(sibling)) {
      continue;
    }
    if (sibling.type !== "heading") {
      return null;
    }
    return textOf(sibling).trim() || null;
  }
  return null;
}

// The migrator writes a database nested in a Notion toggle as a bare link rather than an embed: a paragraph holding
// nothing but a link to a Teable view is converted too.
function soleLinkHref(node: ProsemirrorData): string | null {
  if (node.type !== "paragraph") {
    return null;
  }
  const parts = (node.content ?? []).filter(
    (child) => !(child.type === "text" && !(child.text ?? "").trim())
  );
  const [part] = parts;
  if (parts.length !== 1 || part.type !== "text") {
    return null;
  }
  const link = part.marks?.find((mark) => mark.type === "link");
  const href = link?.attrs?.href;
  return typeof href === "string" && parseTeableHref(href) ? href : null;
}

function isBlank(node: ProsemirrorData): boolean {
  return (
    node.type === "paragraph" &&
    (node.content ?? []).every(
      (child) =>
        child.type === "br" ||
        (child.type === "text" && !(child.text ?? "").trim())
    )
  );
}

function textOf(node: ProsemirrorData): string {
  return (node.text ?? "") + (node.content ?? []).map(textOf).join("");
}

import type Token from "markdown-it/lib/token.mjs";
import type {
  NodeSpec,
  NodeType,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { Plugin } from "prosemirror-state";
import { v4 as uuidv4 } from "uuid";
import { sanitizeUrl } from "../../utils/urls";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import { isRemoteTransaction } from "../lib/multiplayer";
import databasesRule, { databaseHref } from "../rules/databases";
import Node from "./Node";

/** The attributes of a database block. */
export interface DatabaseAttrs {
  /** Identifies the block, eg to remember the reader's active view. */
  id: string | null;
  databaseId: string | null;
  /** The views shown by a linked view, null for all of them. */
  viewIds: string[] | null;
  /** Drawn as a full page database rather than inline. */
  fullPage: boolean;
  /** The embed URL the block was converted from, to allow going back. */
  legacyHref: string | null;
  /** The database name when the block was last written, for text exports. */
  title: string | null;
}

/**
 * Reads the attributes of a database block.
 *
 * @param node the database node.
 * @returns its attributes, typed.
 */
export function databaseAttrs(node: ProsemirrorNode): DatabaseAttrs {
  const { attrs } = node;
  return {
    id: attrs.id ?? null,
    databaseId: attrs.databaseId ?? null,
    viewIds: attrs.viewIds ?? null,
    fullPage: !!attrs.fullPage,
    legacyHref: attrs.legacyHref ?? null,
    title: attrs.title ?? null,
  };
}

/**
 * A database (table, board, calendar… of rows) drawn in a document. The node
 * only points at the database; the app supplies the view that loads it.
 */
export default class Database extends Node {
  get name() {
    return "database";
  }

  /** The view needs the app's stores and router. */
  get allowComponentInStaticHTML() {
    return false;
  }

  get rulePlugins() {
    return [databasesRule];
  }

  get schema(): NodeSpec {
    return {
      group: "block",
      atom: true,
      selectable: true,
      // The view drags cards itself; a draggable node DOM would start a
      // native drag of the whole block instead.
      draggable: false,
      attrs: {
        id: { default: null, validate: "string|null" },
        databaseId: { default: null, validate: "string|null" },
        viewIds: { default: null, validate: validateViewIds },
        fullPage: { default: false, validate: "boolean" },
        legacyHref: { default: null, validate: "string|null" },
        title: { default: null, validate: "string|null" },
      },
      parseDOM: [
        {
          tag: "a.database-link",
          priority: 100,
          getAttrs: (dom: HTMLAnchorElement) => ({
            id: dom.dataset.id || null,
            databaseId: dom.dataset.databaseId || null,
            viewIds: dom.dataset.viewIds
              ? dom.dataset.viewIds.split(",").filter(Boolean)
              : null,
            fullPage: dom.dataset.fullPage === "true",
            legacyHref: dom.dataset.legacyHref || null,
            title: dom.textContent || null,
          }),
        },
      ],
      toDOM: (node) => {
        const attrs = databaseAttrs(node);
        return [
          "a",
          {
            class: "database-link",
            href: attrs.databaseId
              ? sanitizeUrl(`/db/${attrs.databaseId}`)
              : undefined,
            contentEditable: "false",
            "data-id": attrs.id ?? undefined,
            "data-database-id": attrs.databaseId ?? undefined,
            "data-view-ids": attrs.viewIds?.join(",") || undefined,
            "data-full-page": attrs.fullPage ? "true" : undefined,
            "data-legacy-href": attrs.legacyHref
              ? sanitizeUrl(attrs.legacyHref)
              : undefined,
          },
          attrs.title || "Database",
        ];
      },
      leafText: () => "",
    };
  }

  get plugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (
            !transactions.some((tr) => tr.docChanged) ||
            transactions.some((tr) => isRemoteTransaction(tr, newState))
          ) {
            return null;
          }

          const tr = newState.tr;
          const seen = new Set<string>();
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) {
              return !node.isTextblock;
            }
            const id: string | null = node.attrs.id;
            if (!id || seen.has(id)) {
              const next = uuidv4();
              tr.setNodeAttribute(pos, "id", next);
              seen.add(next);
              modified = true;
            } else {
              seen.add(id);
            }
            return false;
          });

          return modified ? tr.setMeta("addToHistory", false) : null;
        },
      }),
    ];
  }

  commands({ type }: { type: NodeType }) {
    return {
      createDatabase:
        (attrs: Partial<DatabaseAttrs> = {}): Command =>
        (state, dispatch) => {
          const node = type.create({ ...attrs, id: attrs.id ?? uuidv4() });
          dispatch?.(state.tr.replaceSelectionWith(node).scrollIntoView());
          return true;
        },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    const { databaseId, viewIds, fullPage, legacyHref, title } =
      databaseAttrs(node);
    if (!databaseId) {
      return;
    }

    const href = databaseHref({ databaseId, viewIds, fullPage, legacyHref });
    const link = `[${state.esc(title || "Database", false)}](${sanitizeUrl(href)})`;
    if (state.inTable) {
      state.write(link);
      return;
    }

    state.ensureNewLine();
    state.write(link);
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      node: "database",
      getAttrs: (token: Token) => {
        const viewIds = (token.attrGet("viewIds") ?? "")
          .split(",")
          .filter(Boolean);
        return {
          id: uuidv4(),
          databaseId: token.attrGet("databaseId"),
          viewIds: viewIds.length ? viewIds : null,
          fullPage: token.attrGet("fullPage") === "true",
          legacyHref: token.attrGet("legacyHref") || null,
          title: token.attrGet("title") || null,
        };
      },
    };
  }
}

function validateViewIds(value: unknown) {
  if (
    value !== null &&
    !(Array.isArray(value) && value.every((id) => typeof id === "string"))
  ) {
    throw new RangeError("viewIds must be an array of strings or null");
  }
}

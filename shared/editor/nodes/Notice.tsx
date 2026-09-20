import type Token from "markdown-it/lib/token.mjs";
import { WarningIcon, InfoIcon, StarredIcon, DoneIcon } from "outline-icons";
import { wrappingInputRule } from "prosemirror-inputrules";
import type {
  DOMOutputSpec,
  NodeSpec,
  Node as ProsemirrorNode,
  NodeType,
} from "prosemirror-model";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import type { Primitive } from "utility-types";
import toggleWrap from "../commands/toggleWrap";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import noticesRule, { noticeInfo } from "../rules/notices";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";
import type { ComponentProps } from "../types";
import Node from "./Node";

export enum NoticeTypes {
  Info = "info",
  Success = "success",
  Tip = "tip",
  Warning = "warning",
  /**
   * galadrim: Notion's plain callout, a neutral grey box with no icon of its
   * own. Two Notion callouts out of three are this one, and it is now what a
   * new notice is, so that writing in Outline gives what writing in Notion
   * gave. The four styles above keep working, for existing documents and for
   * the styles menu.
   */
  Default = "default",
}

/**
 * galadrim: the style a notice written with one of Notion's block colours
 * takes, so that the importer may pass `format.block_color` through as it
 * reads it. A colour Notion has and Outline has not falls back to the nearest
 * one, and anything unknown to the plain grey callout.
 */
const noticeTypeByName: Record<string, NoticeTypes> = {
  [NoticeTypes.Info]: NoticeTypes.Info,
  [NoticeTypes.Success]: NoticeTypes.Success,
  [NoticeTypes.Tip]: NoticeTypes.Tip,
  [NoticeTypes.Warning]: NoticeTypes.Warning,
  [NoticeTypes.Default]: NoticeTypes.Default,
  gray: NoticeTypes.Default,
  grey: NoticeTypes.Default,
  blue: NoticeTypes.Info,
  purple: NoticeTypes.Info,
  yellow: NoticeTypes.Tip,
  orange: NoticeTypes.Tip,
  brown: NoticeTypes.Tip,
  green: NoticeTypes.Success,
  teal: NoticeTypes.Success,
  red: NoticeTypes.Warning,
  pink: NoticeTypes.Warning,
};

/**
 * galadrim: reads the notice style written on the opening fence.
 *
 * @param name A style name, a Notion block colour ("gray_background"), or
 *   anything else a document may carry.
 * @returns The style to render the notice with.
 */
export function toNoticeType(name: string | undefined): NoticeTypes {
  const key = (name ?? "").toLowerCase().replace(/_background$/, "");
  return noticeTypeByName[key] ?? NoticeTypes.Default;
}

export default class Notice extends Node {
  get name() {
    return "container_notice";
  }

  get rulePlugins() {
    return [noticesRule];
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        style: {
          // galadrim: the schema default stays upstream's "info", and every
          // path that makes a notice says which style it wants instead: a
          // notice with no style written is Notion's plain grey callout
          // (parseMarkdown below), and so is one typed as ":::" (inputRules).
          // The revision diff rebuilds nodes from JSON patches that do not
          // always carry `attrs`, so those rebuilt nodes take this default;
          // when it does not match the notice being compared, the diff reads a
          // deleted notice as an attribute change and drops it from the
          // rendered diff (ChangesetHelper, "modified").
          default: NoticeTypes.Info,
        },
        // galadrim: the callout's own emoji, shown in place of the style icon.
        icon: {
          default: null,
        },
      },
      content:
        "(list | blockquote | hr | paragraph | heading | code_block | code_fence | attachment)+",
      group: "block",
      defining: true,
      draggable: true,
      parseDOM: [
        {
          tag: `div.${EditorStyleHelper.notice}`,
          preserveWhitespace: "full",
          contentElement: (node: HTMLDivElement) =>
            node.querySelector(`div.${EditorStyleHelper.noticeContent}`) ||
            node,
          getAttrs: (dom: HTMLDivElement) => ({
            // galadrim: "default" is read back like the other styles, so a
            // plain grey callout stays grey when it is copied, and so is the
            // emoji, so a copied notice keeps its icon.
            style:
              [
                NoticeTypes.Tip,
                NoticeTypes.Warning,
                NoticeTypes.Success,
                NoticeTypes.Default,
              ].find((type) => dom.className.includes(type)) ??
              NoticeTypes.Info,
            icon: dom.dataset.icon ?? null,
          }),
        },
        // Quill editor parsing
        {
          tag: "div.ql-hint",
          preserveWhitespace: "full",
          getAttrs: (dom: HTMLDivElement) => ({
            style: dom.dataset.hint ?? NoticeTypes.Info,
          }),
        },
        // GitBook parsing
        {
          tag: "div.alert.theme-admonition",
          preserveWhitespace: "full",
          getAttrs: (dom: HTMLDivElement) => ({
            style: dom.className.includes(NoticeTypes.Warning)
              ? NoticeTypes.Warning
              : dom.className.includes(NoticeTypes.Success)
                ? NoticeTypes.Success
                : NoticeTypes.Info,
          }),
        },
        // Confluence parsing
        {
          tag: "div.confluence-information-macro",
          preserveWhitespace: "full",
          getAttrs: (dom: HTMLDivElement) => ({
            style: dom.className.includes("confluence-information-macro-tip")
              ? NoticeTypes.Success
              : dom.className.includes("confluence-information-macro-note")
                ? NoticeTypes.Tip
                : dom.className.includes("confluence-information-macro-warning")
                  ? NoticeTypes.Warning
                  : NoticeTypes.Info,
          }),
        },
      ],
      toDOM: (node) => {
        const content: DOMOutputSpec = [
          "div",
          { class: EditorStyleHelper.noticeContent },
          0,
        ];
        // galadrim: the emoji is written next to the content and on the
        // element, so that it survives a copy and shows in the HTML Outline
        // renders outside the editor.
        return node.attrs.icon
          ? [
              "div",
              {
                class: `${EditorStyleHelper.notice} ${node.attrs.style}`,
                "data-icon": node.attrs.icon,
              },
              ["div", { class: EditorStyleHelper.noticeIcon }, node.attrs.icon],
              content,
            ]
          : [
              "div",
              { class: `${EditorStyleHelper.notice} ${node.attrs.style}` },
              content,
            ];
      },
    };
  }

  commands({ type }: { type: NodeType }) {
    return {
      container_notice: (attrs: Record<string, Primitive>) =>
        toggleWrap(type, attrs),
      info: (): Command => (state, dispatch) =>
        this.handleStyleChange(state, dispatch, NoticeTypes.Info),
      warning: (): Command => (state, dispatch) =>
        this.handleStyleChange(state, dispatch, NoticeTypes.Warning),
      success: (): Command => (state, dispatch) =>
        this.handleStyleChange(state, dispatch, NoticeTypes.Success),
      tip: (): Command => (state, dispatch) =>
        this.handleStyleChange(state, dispatch, NoticeTypes.Tip),
      // galadrim: back to Notion's plain grey callout
      default: (): Command => (state, dispatch) =>
        this.handleStyleChange(state, dispatch, NoticeTypes.Default),
    };
  }

  handleStyleChange = (
    state: EditorState,
    dispatch: ((tr: Transaction) => void) | undefined,
    style: NoticeTypes
  ): boolean => {
    const { tr, selection } = state;
    const { $from } = selection;
    const node = $from.node(-1);

    if (node?.type.name === this.name) {
      if (dispatch) {
        const transaction = tr.setNodeMarkup($from.before(-1), undefined, {
          ...node.attrs,
          style,
        });
        dispatch(transaction);
      }
      return true;
    }
    return false;
  };

  component = (props: ComponentProps) => {
    const { node } = props;

    let icon;
    if (node.attrs.icon) {
      // galadrim: the callout's own emoji, as Notion shows it. The style icons
      // below are kept for the notices that have none.
      icon = node.attrs.icon;
    } else if (node.attrs.style === NoticeTypes.Tip) {
      icon = <StarredIcon />;
    } else if (node.attrs.style === NoticeTypes.Warning) {
      icon = <WarningIcon />;
    } else if (node.attrs.style === NoticeTypes.Success) {
      icon = <DoneIcon />;
    } else if (node.attrs.style === NoticeTypes.Default) {
      // galadrim: a plain callout with no emoji has no icon at all, as in
      // Notion — an icon of Outline's own would be a tool difference.
      icon = null;
    } else {
      icon = <InfoIcon />;
    }

    return (
      <div className={`${EditorStyleHelper.notice} ${node.attrs.style}`}>
        {icon ? (
          <div className={EditorStyleHelper.noticeIcon} contentEditable={false}>
            {icon}
          </div>
        ) : null}
        <div
          className={EditorStyleHelper.noticeContent}
          ref={props.contentRef}
        />
      </div>
    );
  };

  inputRules({ type }: { type: NodeType }) {
    // galadrim: typing ":::" gives Notion's plain grey callout, not the blue
    // "info" one. Upstream: wrappingInputRule(/^:::$/, type)
    return [wrappingInputRule(/^:::$/, type, { style: NoticeTypes.Default })];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    // galadrim: the emoji follows the style on the fence, ":::info 💡", which
    // is where the rule reads it back from.
    const icon = node.attrs.icon ? ` ${node.attrs.icon as string}` : "";
    state.write(
      "\n:::" + (node.attrs.style || NoticeTypes.Default) + icon + "\n"
    );
    state.renderContent(node);
    state.ensureNewLine();
    state.write(":::");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "container_notice",
      // galadrim: the style is one of ours or one of Notion's block colours,
      // and the icon is the emoji the callout leads with. Upstream:
      // ({ style: tok.info })
      getAttrs: (tok: Token) => {
        const { style, icon } = noticeInfo(tok);
        return { style: toNoticeType(style), icon: icon ?? null };
      },
    };
  }
}

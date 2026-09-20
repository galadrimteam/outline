import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LinkIcon, SearchIcon } from "outline-icons";
import { ActionSeparator, createAction, createRootMenuAction } from "~/actions";
import {
  restoreDocument,
  unsubscribeDocument,
  subscribeDocument,
  restoreDocumentToCollection,
  starDocument,
  unstarDocument,
  editDocument,
  shareDocument,
  createNewDocument,
  createNewDocumentInAlphabeticalCollection,
  importDocument,
  createTemplateFromDocument,
  duplicateDocument,
  publishDocument,
  unpublishDocument,
  archiveDocument,
  moveDocument,
  applyTemplateActionFactory,
  pinDocument,
  openDocumentComments,
  openDocumentHistory,
  openDocumentInsights,
  openDocumentInDesktop,
  openDocumentInSplit,
  exportDocument,
  copyDocument,
  copyDocumentLink,
  presentDocument,
  searchInDocument,
  deleteDocument,
  leaveDocument,
  permanentlyDeleteDocument,
  toggleDocumentStats,
} from "~/actions/definitions/documents";
import { renameActionFactory } from "~/actions/definitions/common";
import { ActiveDocumentSection } from "~/actions/sections";
import useMobile from "./useMobile";
import type Template from "~/models/Template";
import type {
  ActionGroup,
  ActionSeparator as TActionSeparator,
  ActionVariant,
  ActionWithChildren,
} from "~/types";
import { useTemplateMenuActions } from "./useTemplateMenuActions";

/**
 * galadrim: "Copy link" as a first level entry, as in the menu of a Notion page.
 * The action is otherwise only a child of "Copy", where it has no icon.
 *
 * Built when the menu is opened rather than when this module is evaluated: the
 * action definitions import this file back (through DocumentBreadcrumb), and in
 * that order the action spread here is still undefined.
 */
function copyLinkEntry(): ActionVariant {
  return {
    ...copyDocumentLink,
    id: "copy-document-link-menu",
    icon: <LinkIcon />,
    iconInContextMenu: true,
  };
}

/**
 * galadrim: the page menu offers "Copy link" on its own (above), so its "Copy"
 * submenu keeps only the other ways of copying — Notion has a single
 * "Copier le lien".
 */
function copyWithoutLinkEntry(): ActionWithChildren {
  return {
    ...copyDocument,
    id: "copy-document-menu",
    children: Array.isArray(copyDocument.children)
      ? copyDocument.children.filter((child) => child !== copyDocumentLink)
      : copyDocument.children,
  };
}

/**
 * Which document menu is being built.
 *
 * galadrim: "page" is the "…" of the document currently being viewed, trimmed
 * to the entries of the menu of a Notion page. "context" is every other
 * document menu — sidebar, starred links, document lists, breadcrumb,
 * references — and keeps the whole upstream set: those menus are the only
 * route to archiving, pinning, unpublishing, sharing or templating a document
 * one is *not* viewing, since the command bar resolves its actions against the
 * document of the current URL (see useActionContext).
 */
export type DocumentMenuVariant = "page" | "context";

type MenuEntries = (ActionVariant | ActionGroup | TActionSeparator)[];

type MenuParts = {
  /** The "Find and replace" entry, only shown on mobile. */
  findAndReplace: ActionVariant;
  /** The "Rename" entry, bound to this document. */
  rename: ActionVariant;
  /** The "Apply template" submenu, built from the loaded templates. */
  applyTemplate: ActionVariant;
  /** Whether the document is currently being viewed. */
  isViewing: boolean;
};

/**
 * galadrim: the entries of the "…" menu of the document being viewed, in the
 * order of the menu of a Notion page: favourite, copy link, duplicate, rename,
 * move, trash; then present, import, export, copy, search; then analytics,
 * history, comments, notifications. Entries Notion has no equivalent for left
 * this menu and stay available in the command bar (Ctrl+K), all of them being
 * in rootDocumentActions: edit, permissions (also the Share button of the
 * header), create template, unpublish, archive, new (nested) document, pin,
 * split view and editing stats — and, for a document one is not viewing, in
 * the context menu of the sidebar and of every document list, which keeps the
 * upstream entries below.
 */
export function pageMenuEntries({
  findAndReplace,
  rename,
  applyTemplate,
}: MenuParts): MenuEntries {
  return [
    restoreDocument,
    restoreDocumentToCollection,
    starDocument,
    unstarDocument,
    copyLinkEntry(),
    duplicateDocument,
    rename,
    moveDocument,
    publishDocument,
    deleteDocument,
    permanentlyDeleteDocument,
    leaveDocument,
    ActionSeparator,
    findAndReplace,
    presentDocument,
    applyTemplate,
    importDocument,
    exportDocument,
    copyWithoutLinkEntry(),
    searchInDocument,
    ActionSeparator,
    openDocumentInsights,
    openDocumentHistory,
    openDocumentComments,
    subscribeDocument,
    unsubscribeDocument,
    openDocumentInDesktop,
  ];
}

/**
 * The entries of every other document menu, as upstream orders them.
 */
export function contextMenuEntries({
  findAndReplace,
  rename,
  applyTemplate,
  isViewing,
}: MenuParts): MenuEntries {
  return [
    restoreDocument,
    restoreDocumentToCollection,
    starDocument,
    unstarDocument,
    subscribeDocument,
    unsubscribeDocument,
    findAndReplace,
    ActionSeparator,
    editDocument,
    rename,
    shareDocument,
    createTemplateFromDocument,
    duplicateDocument,
    publishDocument,
    unpublishDocument,
    archiveDocument,
    moveDocument,
    applyTemplate,
    importDocument,
    createNewDocument,
    createNewDocumentInAlphabeticalCollection,
    pinDocument,
    ActionSeparator,
    openDocumentComments,
    openDocumentHistory,
    openDocumentInsights,
    ...(isViewing ? [toggleDocumentStats] : []),
    openDocumentInSplit,
    openDocumentInDesktop,
    presentDocument,
    exportDocument,
    copyDocument,
    searchInDocument,
    ActionSeparator,
    deleteDocument,
    permanentlyDeleteDocument,
    leaveDocument,
  ];
}

/**
 * The entries of a document menu.
 *
 * @param variant - which menu is being built; the full upstream menu unless
 * the trimmed one is asked for, so that a caller that knows nothing of this
 * deviation keeps every entry.
 * @param parts - the entries that depend on the calling component.
 * @returns the entries, in the order they are shown in.
 */
export function documentMenuEntries(
  variant: DocumentMenuVariant | undefined,
  parts: MenuParts
): MenuEntries {
  return variant === "page"
    ? pageMenuEntries(parts)
    : contextMenuEntries(parts);
}

type Props = {
  /** Document ID for which the actions are generated */
  documentId: string;
  /** Whether the document is currently being viewed */
  isViewing?: boolean;
  /**
   * galadrim: which menu is being built, see DocumentMenuVariant. Defaults to
   * the full upstream menu, only the document page asks for the trimmed one.
   */
  variant?: DocumentMenuVariant;
  /** Invoked when the "Find and replace" menu item is clicked */
  onFindAndReplace?: () => void;
  /** Invoked when the "Rename" menu item is clicked */
  onRename?: () => void;
  /** Callback when a template is selected to apply its content to the document */
  onSelectTemplate?: (template: Template) => void;
};

export function useDocumentMenuAction({
  documentId,
  isViewing = false,
  variant,
  onFindAndReplace,
  onRename,
  onSelectTemplate,
}: Props) {
  const { t } = useTranslation();
  const isMobile = useMobile();

  const templateMenuActions = useTemplateMenuActions({
    documentId,
    onSelectTemplate,
  });

  return useCallback(() => {
    const parts: MenuParts = {
      findAndReplace: createAction({
        name: `${t("Find and replace")}…`,
        section: ActiveDocumentSection,
        icon: <SearchIcon />,
        visible: !!onFindAndReplace && isMobile,
        perform: () => onFindAndReplace?.(),
      }),
      rename: renameActionFactory({
        section: ActiveDocumentSection,
        modelId: documentId,
        onRename,
      }),
      applyTemplate: applyTemplateActionFactory({
        actions: templateMenuActions,
      }),
      isViewing,
    };

    return createRootMenuAction(documentMenuEntries(variant, parts));
  }, [
    t,
    isMobile,
    isViewing,
    variant,
    templateMenuActions,
    documentId,
    onFindAndReplace,
    onRename,
  ]);
}

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
  importDocument,
  duplicateDocument,
  publishDocument,
  moveDocument,
  applyTemplateActionFactory,
  openDocumentComments,
  openDocumentHistory,
  openDocumentInsights,
  openDocumentInDesktop,
  exportDocument,
  copyDocument,
  copyDocumentLink,
  presentDocument,
  searchInDocument,
  deleteDocument,
  leaveDocument,
  permanentlyDeleteDocument,
} from "~/actions/definitions/documents";
import { renameActionFactory } from "~/actions/definitions/common";
import { ActiveDocumentSection } from "~/actions/sections";
import useMobile from "./useMobile";
import type Template from "~/models/Template";
import { useTemplateMenuActions } from "./useTemplateMenuActions";

/**
 * galadrim: "Copy link" as a first level entry, as in the menu of a Notion page.
 * The action is otherwise only a child of "Copy", where it has no icon.
 */
const copyLink = {
  ...copyDocumentLink,
  id: "copy-document-link-menu",
  icon: <LinkIcon />,
  iconInContextMenu: true,
};

type Props = {
  /** Document ID for which the actions are generated */
  documentId: string;
  /**
   * Whether the document is currently being viewed. galadrim: unused since the
   * "Show editing stats" entry left the menu, kept for the callers.
   */
  isViewing?: boolean;
  /** Invoked when the "Find and replace" menu item is clicked */
  onFindAndReplace?: () => void;
  /** Invoked when the "Rename" menu item is clicked */
  onRename?: () => void;
  /** Callback when a template is selected to apply its content to the document */
  onSelectTemplate?: (template: Template) => void;
};

export function useDocumentMenuAction({
  documentId,
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

  // galadrim: the menu follows the "…" menu of a Notion page, in its order:
  // favourite, copy link, duplicate, rename, move, trash; then present, import,
  // export, copy, search; then analytics, history, comments, notifications.
  // Entries Notion has no equivalent for left the menu and stay available in
  // the command bar (Ctrl+K), all of them being in rootDocumentActions: edit,
  // permissions (the Share button of the header), create template, unpublish,
  // archive, new (nested) document, pin, split view and editing stats.
  return useCallback(
    () =>
      createRootMenuAction([
        restoreDocument,
        restoreDocumentToCollection,
        starDocument,
        unstarDocument,
        copyLink,
        duplicateDocument,
        renameActionFactory({
          section: ActiveDocumentSection,
          modelId: documentId,
          onRename,
        }),
        moveDocument,
        publishDocument,
        deleteDocument,
        permanentlyDeleteDocument,
        leaveDocument,
        ActionSeparator,
        createAction({
          name: `${t("Find and replace")}…`,
          section: ActiveDocumentSection,
          icon: <SearchIcon />,
          visible: !!onFindAndReplace && isMobile,
          perform: () => onFindAndReplace?.(),
        }),
        presentDocument,
        applyTemplateActionFactory({ actions: templateMenuActions }),
        importDocument,
        exportDocument,
        copyDocument,
        searchInDocument,
        ActionSeparator,
        openDocumentInsights,
        openDocumentHistory,
        openDocumentComments,
        subscribeDocument,
        unsubscribeDocument,
        openDocumentInDesktop,
      ]),
    [t, isMobile, templateMenuActions, documentId, onFindAndReplace, onRename]
  );
}

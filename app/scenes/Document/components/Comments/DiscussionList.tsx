import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { ProsemirrorData } from "@shared/types";
import type Comment from "~/models/Comment";
import type Document from "~/models/Document";
import usePersistedState from "~/hooks/usePersistedState";
import CommentForm from "./CommentForm";
import CommentThread from "./CommentThread";

interface Props {
  /** The page the discussions belong to. */
  document: Document;
  /** The open discussions to show, in order. */
  threads: Comment[];
  /** Whether a discussion folds from its third reply on, as Notion's page does. */
  fold: boolean;
  /** Whether the form that starts a discussion follows them. */
  showForm: boolean;
  /** Changing it mounts the form again, focused. */
  formKey: number;
}

/**
 * Discussions of a page drawn as Notion draws them in the page or in a popover: plain rows with a
 * line down each thread, a thread replying in place, then the form that starts a new one.
 *
 * @param props the page, its discussions and what to show.
 * @returns the discussions.
 */
export const DiscussionList = observer(function DiscussionList_({
  document,
  threads,
  fold,
  showForm,
  formKey,
}: Props) {
  const { t } = useTranslation();
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [draft, onSaveDraft] = usePersistedState<ProsemirrorData | undefined>(
    `draft-${document.id}-page`,
    undefined
  );
  const handleBlur = React.useCallback(() => setFocusedId(null), []);

  return (
    <>
      {threads.map((thread) => (
        <CommentThread
          key={thread.id}
          comment={thread}
          document={document}
          focused={focusedId === thread.id}
          recessed={false}
          collapseThreshold={fold ? FOLD_REPLIES : Infinity}
          collapseNumDisplayed={1}
          onFocus={() => setFocusedId(thread.id)}
          onBlur={handleBlur}
          inPage
        />
      ))}
      {showForm && (
        <CommentForm
          key={formKey}
          documentId={document.id}
          draft={draft}
          onSaveDraft={onSaveDraft}
          placeholder={`${t("Add a comment")}…`}
          autoFocus={formKey > 0}
          standalone
          inPage
        />
      )}
    </>
  );
});

/** Notion folds a discussion from its third reply on, keeping its first and last comments. */
const FOLD_REPLIES = 3;

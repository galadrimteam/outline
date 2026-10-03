import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import useShare from "@shared/hooks/useShare";
import { s } from "@shared/styles";
import type { ProsemirrorData } from "@shared/types";
import type Document from "~/models/Document";
import { useDocumentContext } from "~/components/DocumentContext";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useCurrentUser from "~/hooks/useCurrentUser";
import usePersistedState from "~/hooks/usePersistedState";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import CommentForm from "./CommentForm";
import CommentThread from "./CommentThread";

interface Props {
  /** The page. */
  document: Document;
  /** Whether the form to start a discussion shows on a page that has none, as on a database row. */
  showEmpty?: boolean;
}

/**
 * The discussions of the page itself, under its title (and the properties of a database row),
 * like Notion's « Comments »: every open thread that is not anchored to a passage, collapsed to
 * its first and last comments from three on, then the form that starts a new one. A thread
 * replies in place and its resolved threads leave the page; all of them stay in the sidebar.
 *
 * @param props the page and whether the form shows when it has no discussion.
 * @returns the discussions, or nothing when there are none to show.
 */
export const PageComments = observer(function PageComments_({
  document,
  showEmpty,
}: Props) {
  const { t } = useTranslation();
  const { comments } = useStores();
  const { anchoredCommentIds } = useDocumentContext();
  const user = useCurrentUser({ rejectOnEmpty: false });
  const team = useCurrentTeam({ rejectOnEmpty: false });
  const { isShare } = useShare();
  const can = usePolicy(document);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [draft, onSaveDraft] = usePersistedState<ProsemirrorData | undefined>(
    `draft-${document.id}-page`,
    undefined
  );
  const handleBlur = React.useCallback(() => setFocusedId(null), []);

  // anchors are only known once an editor holds the document
  if (!user || isShare || !team?.commentingEnabled || !anchoredCommentIds) {
    return null;
  }

  const threads = comments.pageThreadsInDocument(
    document.id,
    anchoredCommentIds
  );
  const canStart = !!can.comment;
  if (!threads.length && !(showEmpty && canStart)) {
    return null;
  }

  return (
    <Section aria-label={t("Comments")}>
      <Heading>{t("Comments")}</Heading>
      {threads.map((thread) => (
        <CommentThread
          key={thread.id}
          comment={thread}
          document={document}
          focused={focusedId === thread.id}
          recessed={false}
          collapseThreshold={COLLAPSE_REPLIES}
          collapseNumDisplayed={1}
          onFocus={() => setFocusedId(thread.id)}
          onBlur={handleBlur}
        />
      ))}
      {canStart && (
        <CommentForm
          documentId={document.id}
          draft={draft}
          onSaveDraft={onSaveDraft}
          placeholder={`${t("Add a comment")}…`}
          autoFocus={false}
          standalone
        />
      )}
    </Section>
  );
});

/** Notion folds a discussion from its second reply on, keeping the first and last comments. */
const COLLAPSE_REPLIES = 2;

const Section = styled.section`
  margin-top: 16px;

  [data-comment-thread] {
    margin: 0 0 32px;
  }
`;

const Heading = styled.h2`
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 500;
  color: ${s("textSecondary")};
`;

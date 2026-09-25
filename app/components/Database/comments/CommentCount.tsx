import { observer } from "mobx-react";
import { CommentIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import useStores from "~/hooks/useStores";
import { rowCommentCounts } from "./rowCommentCounts";

interface Props {
  /** The database of the row. */
  databaseId: string;
  /** The row. */
  recordId: string;
  /** The row's page: null when it has none, and so no comment. */
  documentId?: string | null;
  className?: string;
}

/**
 * The number of open comments on a row's page, as a card or a table row shows
 * it in Notion. Nothing is drawn while there is none.
 *
 * @param props the row and its page.
 * @returns the count, or nothing.
 */
export const CommentCount = observer(function CommentCount_({
  databaseId,
  recordId,
  documentId,
  className,
}: Props) {
  const { t } = useTranslation();
  const { comments } = useStores();
  const hasPage = documentId !== null;

  React.useEffect(() => {
    if (hasPage) {
      rowCommentCounts.request(databaseId, recordId);
    }
  }, [databaseId, recordId, hasPage]);

  if (!hasPage) {
    return null;
  }
  // Comments loaded with the open page are newer than the batched count.
  const live = documentId
    ? comments.unresolvedCommentsInDocumentCount(documentId)
    : 0;
  const count = live || rowCommentCounts.get(databaseId, recordId);
  if (!count) {
    return null;
  }

  return (
    <Count
      className={className}
      role="note"
      aria-label={t("{{ count }} comment", { count })}
    >
      <CommentIcon size={16} />
      {count}
    </Count>
  );
});

const Count = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: ${s("textTertiary")};

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }
`;

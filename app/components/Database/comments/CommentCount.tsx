import { observer } from "mobx-react";
import { CommentIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import useShare from "@shared/hooks/useShare";
import { s } from "@shared/styles";
import useStores from "~/hooks/useStores";
import { useDatabaseBlock } from "../DatabaseBlockContext";
import { RowCommentsPopover } from "./RowCommentsPopover";
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
 * it in Notion. Nothing is drawn while there is none. Inside a database block
 * a click opens the row's discussions in a popover on the spot, as Notion
 * does, and nothing else.
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
  const { isShare } = useShare();
  const interactive = !!useDatabaseBlock() && !isShare;
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

  const label = t("{{ count }} comment", { count });
  if (!interactive) {
    return (
      <Count className={className} role="note" aria-label={label}>
        <CommentIcon size={16} />
        {count}
      </Count>
    );
  }

  return (
    <RowCommentsPopover databaseId={databaseId} recordId={recordId}>
      <CountButton
        type="button"
        className={className}
        aria-label={label}
        title={t("Open comments")}
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        onMouseDown={stopPropagation}
        onTouchStart={stopPropagation}
        onKeyDown={stopPropagation}
      >
        <CommentIcon size={16} />
        {count}
      </CountButton>
    </RowCommentsPopover>
  );
});

/** Keeps a click on the count from dragging, selecting or opening what holds it. */
function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

const count = css`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: ${s("textTertiary")};

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }
`;

const Count = styled.span`
  ${count}
`;

// Notion's own measures: 20px tall, 2px before the icon and 5px after the number.
const CountButton = styled.button`
  ${count}
  height: 20px;
  margin: 0;
  padding: 0 5px 0 2px;
  border: 0;
  border-radius: 4px;
  background: none;
  font-family: inherit;
  line-height: 20px;
  cursor: var(--pointer);

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

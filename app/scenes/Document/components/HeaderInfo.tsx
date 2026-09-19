import { observer } from "mobx-react";
import { CommentIcon } from "outline-icons";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouteMatch } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import type Document from "~/models/Document";
import { Action } from "~/components/Actions";
import Button from "~/components/Button";
import { useSplitView } from "~/components/SplitView/context";
import Time from "~/components/Time";
import Tooltip from "~/components/Tooltip";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import { useLocationSidebarContext } from "~/hooks/useLocationSidebarContext";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import {
  documentHistoryPath,
  documentPath,
  matchDocumentHistory,
} from "~/utils/routeHelpers";

type Props = {
  /** The document displayed beneath the header. */
  document: Document;
  /** Whether the header is short on space, only the icons are rendered. */
  isCompact?: boolean;
};

/**
 * galadrim: what is left of the meta line upstream renders under the document
 * title, moved to the header where a Notion page shows it: a discreet "Edited
 * <time>" that opens the history, and a comments button that only exists once
 * the document has unresolved comments.
 */
function HeaderInfo({ document, isCompact }: Props) {
  const { t } = useTranslation();
  const { comments, ui } = useStores();
  const { pane } = useSplitView();
  const match = useRouteMatch();
  const team = useCurrentTeam({ rejectOnEmpty: false });
  const sidebarContext = useLocationSidebarContext();
  const can = usePolicy(document);

  const commentsCount = comments.unresolvedCommentsInDocumentCount(document.id);
  const commentsOpen = ui.getRightSidebar(pane) === "comments";
  const showComments =
    !!team?.commentingEnabled && can.comment && commentsCount > 0;

  const handleClickComments = useCallback(() => {
    ui.setRightSidebar(commentsOpen ? null : "comments", pane);
  }, [ui, pane, commentsOpen]);

  return (
    <>
      {can.listRevisions && document.updatedAt && !isCompact ? (
        <Action>
          <Edited
            to={{
              pathname:
                match.path === matchDocumentHistory
                  ? documentPath(document)
                  : documentHistoryPath(document),
              state: { sidebarContext },
            }}
            replace
          >
            {t("Edited")} <Time dateTime={document.updatedAt} addSuffix />
          </Edited>
        </Action>
      ) : null}
      {showComments ? (
        <Action>
          <Tooltip
            content={t("{{ count }} comment", { count: commentsCount })}
            placement="bottom"
          >
            <Button
              icon={<CommentIcon />}
              onClick={handleClickComments}
              aria-label={t("Comments")}
              aria-expanded={commentsOpen}
              borderOnHover
              neutral
            />
          </Tooltip>
        </Action>
      ) : null}
    </>
  );
}

const Edited = styled(Link)`
  color: ${s("textTertiary")};
  font-size: 14px;
  white-space: nowrap;
  cursor: var(--pointer);
  user-select: none;

  &:hover {
    color: ${s("textSecondary")};
  }
`;

export default observer(HeaderInfo);

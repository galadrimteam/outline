import { observer } from "mobx-react";
import { GrowIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import Tooltip from "~/components/Tooltip";
import type Database from "~/models/Database";
import { databasePath } from "~/utils/routeHelpers";
import { useDatabaseShare } from "../useDatabaseShare";
import { ToolbarButton } from "./components";

interface Props {
  /** The database shown by the block. */
  database: Database;
  /** The document the block is drawn in, if any. */
  documentId: string | undefined;
}

/**
 * Notion's ↗ on a database shown inside a page: opens the page the database
 * lives in. Not offered when that page is the one being read, nor through a
 * share, where `/db/:id` is out of reach.
 *
 * @param props the database and the document holding the block.
 * @returns the button, or nothing.
 */
export const OpenFullPageButton = observer(function OpenFullPageButton({
  database,
  documentId,
}: Props) {
  const { t } = useTranslation();
  const history = useHistory();
  const share = useDatabaseShare();

  if (
    !share.canLinkToDatabase ||
    !database.documentId ||
    database.documentId === documentId
  ) {
    return null;
  }

  const label = t("Open as full page");
  return (
    <Tooltip content={label}>
      <ToolbarButton
        type="button"
        aria-label={label}
        onClick={() => history.push(databasePath(database.id))}
      >
        <GrowIcon size={18} />
      </ToolbarButton>
    </Tooltip>
  );
});

import { observer } from "mobx-react";
import { LightningIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import Tooltip from "~/components/Tooltip";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { ToolbarButton } from "../toolbar/components";
import { useDatabaseShare } from "../useDatabaseShare";
import { openDatabaseAutomations } from "./openDatabaseAutomations";

interface Props {
  /** The database shown by the block. */
  database: Database;
}

/**
 * The ⚡ of the view toolbar, in the accent colour while some automation of
 * the database is on, as in Notion; it opens the automations. Hidden from
 * people who may not edit the database and while none is on.
 *
 * @param props the database.
 * @returns the button, or nothing.
 */
export const AutomationsToolbarButton = observer(
  function AutomationsToolbarButton({ database }: Props) {
    const { t } = useTranslation();
    const { dialogs, policies } = useStores();
    const share = useDatabaseShare();

    if (
      share.isShare ||
      !policies.abilities(database.id).update ||
      !database.automationCount
    ) {
      return null;
    }

    const label = t("Automations");
    return (
      <Tooltip content={label}>
        <ToolbarButton
          type="button"
          aria-label={label}
          $active
          onClick={() => openDatabaseAutomations({ dialogs, database, t })}
        >
          <LightningIcon size={20} />
        </ToolbarButton>
      </Tooltip>
    );
  }
);

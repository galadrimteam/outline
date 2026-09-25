import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import { s } from "@shared/styles";
import useStores from "~/hooks/useStores";
import type { CellRendererProps } from "../cells/types";
import { clickDatabaseButton } from "./automationsApi";

/**
 * A button property drawn as a button: clicking it runs the automations of
 * that button on the row, for people who may edit the database.
 *
 * @param props the cell renderer props; without a row the label is only drawn.
 * @returns the button.
 */
export const AutomationButton = observer(function AutomationButton_({
  field,
  database,
  record,
}: CellRendererProps) {
  const { t } = useTranslation();
  const { policies } = useStores();
  const [isRunning, setIsRunning] = React.useState(false);
  const label = field.options.label || field.name || t("Button");
  const canClick = !!record && !!policies.abilities(database.id).update;

  const handleClick = React.useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!record || isRunning) {
        return;
      }
      setIsRunning(true);
      try {
        const result = await clickDatabaseButton(
          database.id,
          record.id,
          field.id
        );
        if (result.errors.length) {
          toast.error(t("An automation of this button failed"));
        } else if (!result.ran) {
          toast.message(t("No automation runs on this button yet"));
        }
      } catch (_err) {
        toast.error(t("Couldn’t run the button"));
      } finally {
        setIsRunning(false);
      }
    },
    [database.id, field.id, isRunning, record, t]
  );

  return (
    <Pill
      type="button"
      disabled={!canClick || isRunning}
      aria-busy={isRunning}
      onClick={handleClick}
    >
      {label}
    </Pill>
  );
});

const Pill = styled.button`
  display: inline-block;
  max-width: 100%;
  padding: 0 8px;
  overflow: hidden;
  border: 1px solid ${s("divider")};
  border-radius: 4px;
  background: ${s("background")};
  color: ${s("textSecondary")};
  font: inherit;
  font-size: 13px;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: var(--pointer);

  &:hover:not(:disabled) {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }

  &:disabled {
    cursor: default;
  }
`;

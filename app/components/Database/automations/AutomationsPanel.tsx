import { observer } from "mobx-react";
import { LightningIcon, PlusIcon, WarningIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { PresentedDatabaseAutomation } from "@shared/databases/automations";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Switch from "~/components/Switch";
import Time from "~/components/Time";
import type Database from "~/models/Database";
import type { AutomationDraft } from "./automationsApi";
import { AutomationEditor } from "./AutomationEditor";
import {
  actionSummary,
  draftFromAutomation,
  emptyDraft,
  triggerSummary,
} from "./automationText";
import { useDatabaseAutomations } from "./useDatabaseAutomations";

interface Props {
  /** The database, its schema loaded. */
  database: Database;
}

interface Editing {
  /** The automation edited; undefined for a new one. */
  automation?: PresentedDatabaseAutomation;
  draft: AutomationDraft;
}

/**
 * The « ⚡ Automations » of a database for its editors: the list, each one
 * switched on or off in place, and the editor of one automation.
 *
 * @param props the database.
 * @returns the panel.
 */
export const AutomationsPanel = observer(function AutomationsPanel_({
  database,
}: Props) {
  const { t } = useTranslation();
  const { automations, error, reload, save, setEnabled, remove } =
    useDatabaseAutomations(database.id);
  const [editing, setEditing] = React.useState<Editing>();
  const [isSaving, setIsSaving] = React.useState(false);
  const fields = database.fields ?? [];

  const handleSave = React.useCallback(async () => {
    if (!editing) {
      return;
    }
    setIsSaving(true);
    try {
      await save(editing.automation?.id, editing.draft);
      setEditing(undefined);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t("Couldn’t save the automation")
      );
    } finally {
      setIsSaving(false);
    }
  }, [editing, save, t]);

  const handleDelete = React.useCallback(async () => {
    const id = editing?.automation?.id;
    if (!id) {
      return;
    }
    try {
      await remove(id);
      setEditing(undefined);
    } catch (_err) {
      toast.error(t("Couldn’t delete the automation"));
    }
  }, [editing, remove, t]);

  const handleToggle = React.useCallback(
    (automation: PresentedDatabaseAutomation, enabled: boolean) => {
      setEnabled(automation.id, enabled).catch(() =>
        toast.error(t("Couldn’t save the automation"))
      );
    },
    [setEnabled, t]
  );

  if (editing) {
    return (
      <AutomationEditor
        database={database}
        draft={editing.draft}
        onChange={(draft) => setEditing({ ...editing, draft })}
        onSave={() => void handleSave()}
        onCancel={() => setEditing(undefined)}
        onDelete={editing.automation ? () => void handleDelete() : undefined}
        isSaving={isSaving}
        lastError={editing.automation?.lastError}
      />
    );
  }

  return (
    <Wrapper>
      <Intro>
        {t(
          "Automations run on their own when rows are added or edited, for example to fill in a date when a status changes, notify the assignee or post to Slack."
        )}
      </Intro>
      {error ? (
        <Notice role="alert">
          {t("Couldn’t load the automations.")}
          <Button type="button" neutral onClick={reload}>
            {t("Retry")}
          </Button>
        </Notice>
      ) : !automations ? (
        <Notice aria-busy>{t("Loading…")}</Notice>
      ) : automations.length === 0 ? (
        <Notice>{t("No automation yet.")}</Notice>
      ) : (
        <List>
          {automations.map((automation) => (
            <Item key={automation.id}>
              <ItemButton
                type="button"
                onClick={() =>
                  setEditing({
                    automation,
                    draft: draftFromAutomation(automation),
                  })
                }
              >
                <LightningIcon size={20} />
                <ItemText>
                  <ItemName>
                    {automation.name || t("Untitled automation")}
                  </ItemName>
                  <ItemSummary>
                    {[
                      triggerSummary(automation.trigger, fields, t),
                      ...automation.actions.map((action) =>
                        actionSummary(action, fields, t)
                      ),
                    ].join(" → ")}
                  </ItemSummary>
                  {automation.lastError ? (
                    <ItemError>
                      <WarningIcon size={16} />
                      {t("The last run failed")}
                    </ItemError>
                  ) : automation.lastRunAt ? (
                    <ItemMeta>
                      {t("Last run")}{" "}
                      <Time dateTime={automation.lastRunAt} addSuffix />
                    </ItemMeta>
                  ) : null}
                </ItemText>
              </ItemButton>
              <Switch
                checked={automation.enabled}
                aria-label={
                  automation.enabled
                    ? t("Turn the automation off")
                    : t("Turn the automation on")
                }
                onChange={(enabled) => handleToggle(automation, enabled)}
                inForm={false}
              />
            </Item>
          ))}
        </List>
      )}
      <div>
        <Button
          type="button"
          icon={<PlusIcon />}
          onClick={() => setEditing({ draft: emptyDraft() })}
        >
          {t("New automation")}
        </Button>
      </div>
    </Wrapper>
  );
});

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Intro = styled.p`
  margin: 0;
  color: ${s("textSecondary")};
  font-size: 14px;
`;

const Notice = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid ${s("divider")};
  border-radius: 8px;
`;

const Item = styled.li`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-inline-end: 12px;

  & + & {
    border-top: 1px solid ${s("divider")};
  }
`;

const ItemButton = styled.button`
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 0;
  background: none;
  color: ${s("text")};
  font: inherit;
  text-align: start;
  cursor: var(--pointer);

  svg {
    flex-shrink: 0;
    margin-top: 1px;
    fill: ${s("accent")};
  }

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    outline: none;
  }
`;

const ItemText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const ItemName = styled.span`
  font-size: 14px;
  font-weight: 500;
`;

const ItemSummary = styled.span`
  color: ${s("textSecondary")};
  font-size: 13px;
`;

const ItemMeta = styled.span`
  color: ${s("textTertiary")};
  font-size: 12px;
`;

const ItemError = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${s("danger")};
  font-size: 12px;

  svg {
    fill: ${s("danger")};
    margin: 0;
  }
`;

import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseAutomationAction,
  DatabaseAutomationActionType,
} from "@shared/databases/automations";
import { DatabaseAutomationLimits } from "@shared/databases/automations";
import type { DatabaseFilter } from "@shared/databases/types";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import type Database from "~/models/Database";
import { FilterBuilder } from "../toolbar/FilterBuilder";
import { CompactSelect, PanelAction, SmallInput } from "../toolbar/components";
import { ActionEditor } from "./ActionEditor";
import type { AutomationDraft } from "./automationsApi";
import { actionTypeLabel, draftProblem, newAction } from "./automationText";
import { TriggerEditor } from "./TriggerEditor";

interface Props {
  database: Database;
  draft: AutomationDraft;
  onChange: (draft: AutomationDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Deletes the automation; absent for a new one. */
  onDelete?: () => void;
  isSaving: boolean;
  /** What went wrong the last time the automation ran. */
  lastError?: string | null;
}

const actionTypes: DatabaseAutomationActionType[] = [
  "setProperty",
  "notify",
  "slack",
  "createRecord",
];

/**
 * Edits an automation like Notion: « When » a trigger, « Only if » optional
 * conditions on the row, « Do » a list of actions.
 *
 * @param props the draft and its callbacks.
 * @returns the editor.
 */
export const AutomationEditor = observer(function AutomationEditor_({
  database,
  draft,
  onChange,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  lastError,
}: Props) {
  const { t } = useTranslation();
  const fields = database.fields ?? [];
  const [showConditions, setShowConditions] = React.useState(
    !!draft.conditions
  );
  const problem = draftProblem(draft, t);

  const handleConditionsChange = React.useCallback(
    (conditions: DatabaseFilter | null) => {
      onChange({ ...draft, conditions });
      if (!conditions) {
        setShowConditions(false);
      }
    },
    [draft, onChange]
  );

  const handleActionChange = (
    index: number,
    action: DatabaseAutomationAction
  ) =>
    onChange({
      ...draft,
      actions: draft.actions.map((item, i) => (i === index ? action : item)),
    });

  const handleActionRemove = (index: number) =>
    onChange({
      ...draft,
      actions: draft.actions.filter((_item, i) => i !== index),
    });

  const handleActionAdd = (type: DatabaseAutomationActionType) =>
    onChange({
      ...draft,
      actions: [...draft.actions, newAction(type, fields, database.id)],
    });

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem) {
          onSave();
        }
      }}
    >
      <NameInput
        value={draft.name}
        placeholder={t("Untitled automation")}
        aria-label={t("Automation name")}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
      {lastError && (
        <ErrorNote role="alert">
          {t("The last run failed")} · {lastError}
        </ErrorNote>
      )}

      <Section>
        <SectionTitle>{t("When")}</SectionTitle>
        <TriggerEditor
          database={database}
          trigger={draft.trigger}
          onChange={(trigger) => onChange({ ...draft, trigger })}
        />
      </Section>

      <Section>
        <SectionTitle>{t("Only if")}</SectionTitle>
        {showConditions ? (
          <Conditions>
            <FilterBuilder
              database={database}
              filter={draft.conditions}
              onChange={handleConditionsChange}
              records={[]}
            />
          </Conditions>
        ) : (
          <PanelAction type="button" onClick={() => setShowConditions(true)}>
            <PlusIcon size={18} />
            {t("Add a condition on the row")}
          </PanelAction>
        )}
      </Section>

      <Section>
        <SectionTitle>{t("Do")}</SectionTitle>
        {draft.actions.map((action, index) => (
          <ActionEditor
            key={index}
            database={database}
            action={action}
            onChange={(next) => handleActionChange(index, next)}
            onRemove={() => handleActionRemove(index)}
          />
        ))}
        {draft.actions.length < DatabaseAutomationLimits.maxActions && (
          <AddAction>
            <PlusIcon size={18} />
            <CompactSelect
              value={undefined}
              options={actionTypes.map((type) => ({
                value: type,
                label: actionTypeLabel(type, t),
              }))}
              onChange={handleActionAdd}
              ariaLabel={t("Add an action")}
              placeholder={t("Add an action")}
              borderless
            />
          </AddAction>
        )}
      </Section>

      <Footer>
        {problem ? <Problem>{problem}</Problem> : <span />}
        <FooterButtons>
          {onDelete && (
            <Button type="button" onClick={onDelete} danger>
              {t("Delete")}
            </Button>
          )}
          <Button type="button" onClick={onCancel} neutral>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={!!problem || isSaving}>
            {isSaving ? `${t("Saving")}…` : t("Save")}
          </Button>
        </FooterButtons>
      </Footer>
    </Form>
  );
});

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const NameInput = styled(SmallInput)`
  height: 34px;
  font-size: 16px;
  font-weight: 600;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  color: ${s("textTertiary")};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
`;

const Conditions = styled.div`
  padding: 6px;
  border: 1px solid ${s("divider")};
  border-radius: 8px;
`;

const AddAction = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${s("textTertiary")};
`;

const ErrorNote = styled.p`
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: ${(props) => props.theme.danger}1a;
  color: ${s("danger")};
  font-size: 13px;
  white-space: pre-wrap;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const FooterButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const Problem = styled.span`
  color: ${s("textTertiary")};
  font-size: 13px;
`;

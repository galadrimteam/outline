import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseAutomationTrigger,
  DatabaseAutomationTriggerType,
} from "@shared/databases/automations";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s } from "@shared/styles";
import type Database from "~/models/Database";
import { ChoicePill } from "../cells/components/ChoicePill";
import { CompactSelect } from "../toolbar/components";

interface Props {
  database: Database;
  trigger: DatabaseAutomationTrigger;
  onChange: (trigger: DatabaseAutomationTrigger) => void;
}

/**
 * Picks what starts an automation: a row added, a property changed (to some
 * values), or a button clicked.
 *
 * @param props the database, the trigger and the change callback.
 * @returns the trigger picker.
 */
export const TriggerEditor = observer(function TriggerEditor_({
  database,
  trigger,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const fields = database.fields ?? [];
  const buttons = fields.filter(
    (field) => field.type === DatabaseFieldType.Button
  );
  const watched = fields.filter(
    (field) =>
      field.type !== DatabaseFieldType.Button &&
      field.type !== DatabaseFieldType.Attachment
  );

  const types: { value: DatabaseAutomationTriggerType; label: string }[] = [
    { value: "recordCreated", label: t("A row is added") },
    { value: "propertyChanged", label: t("A property is edited") },
    ...(buttons.length
      ? [{ value: "buttonClicked" as const, label: t("A button is clicked") }]
      : []),
  ];

  const handleTypeChange = React.useCallback(
    (type: DatabaseAutomationTriggerType) => {
      if (type === trigger.type) {
        return;
      }
      if (type === "recordCreated") {
        onChange({ type });
      } else if (type === "buttonClicked") {
        onChange({ type, fieldId: buttons[0]?.id ?? "" });
      } else {
        onChange({ type, fieldId: watched[0]?.id ?? "" });
      }
    },
    [buttons, onChange, trigger.type, watched]
  );

  const candidates = trigger.type === "buttonClicked" ? buttons : watched;
  const field =
    trigger.type === "recordCreated"
      ? undefined
      : fields.find((item) => item.id === trigger.fieldId);

  return (
    <Wrapper>
      <Row>
        <CompactSelect
          value={trigger.type}
          options={types}
          onChange={handleTypeChange}
          ariaLabel={t("Trigger")}
          width={210}
        />
        {trigger.type !== "recordCreated" && (
          <CompactSelect
            value={trigger.fieldId || undefined}
            options={candidates.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            onChange={(fieldId) =>
              onChange(
                trigger.type === "buttonClicked"
                  ? { type: "buttonClicked", fieldId }
                  : { type: "propertyChanged", fieldId }
              )
            }
            ariaLabel={t("Property")}
            placeholder={t("Choose a property")}
            width={200}
          />
        )}
      </Row>
      {trigger.type === "propertyChanged" && field && (
        <TargetValues
          field={field}
          values={trigger.to ?? []}
          onChange={(to) =>
            onChange({
              type: "propertyChanged",
              fieldId: field.id,
              to: to.length ? to : undefined,
            })
          }
        />
      )}
    </Wrapper>
  );
});

interface TargetValuesProps {
  field: DatabaseField;
  values: string[];
  onChange: (values: string[]) => void;
}

/** « Set to »: the values that start the automation, any change when none is picked. */
function TargetValues({ field, values, onChange }: TargetValuesProps) {
  const { t } = useTranslation();

  if (field.type === DatabaseFieldType.Checkbox) {
    return (
      <Row>
        <Hint>{t("Set to")}</Hint>
        <CompactSelect
          value={values[0] ?? "any"}
          options={[
            { value: "any", label: t("Any change") },
            { value: "true", label: t("Checked") },
            { value: "false", label: t("Unchecked") },
          ]}
          onChange={(next) => onChange(next === "any" ? [] : [next])}
          ariaLabel={t("Set to")}
          width={160}
        />
      </Row>
    );
  }

  const choices = field.options.choices ?? [];
  if (!choices.length) {
    return <Hint>{t("Runs on any change of this property.")}</Hint>;
  }

  const toggle = (name: string) =>
    onChange(
      values.includes(name)
        ? values.filter((value) => value !== name)
        : [...values, name]
    );

  return (
    <Row role="group" aria-label={t("Set to")}>
      <Hint>{values.length ? t("Set to") : t("Any change, or set to")}</Hint>
      {choices.map((choice) => (
        <ChoiceToggle
          key={choice.id ?? choice.name}
          type="button"
          aria-pressed={values.includes(choice.name)}
          $selected={values.includes(choice.name)}
          onClick={() => toggle(choice.name)}
        >
          <ChoicePill choice={choice} />
        </ChoiceToggle>
      ))}
    </Row>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`;

const Hint = styled.span`
  color: ${s("textTertiary")};
  font-size: 13px;
`;

const ChoiceToggle = styled.button<{ $selected: boolean }>`
  display: inline-flex;
  padding: 2px;
  border: 1px solid
    ${(props) => (props.$selected ? props.theme.accent : "transparent")};
  border-radius: 6px;
  background: none;
  opacity: ${(props) => (props.$selected ? 1 : 0.6)};
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    opacity: 1;
    outline: none;
  }
`;

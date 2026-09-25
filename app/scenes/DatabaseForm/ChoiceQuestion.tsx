import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DatabaseCellInput, DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s } from "@shared/styles";
import { ChoicePill } from "~/components/Database/cells/components/ChoicePill";

interface Props {
  field: DatabaseField;
  value: DatabaseCellInput | undefined;
  onChange: (value: DatabaseCellInput) => void;
  /** Id of the question's label. */
  labelledBy: string;
}

/**
 * The options of a select question laid out like Notion's forms: one click
 * picks an option (or toggles it for a multiple select). A form never adds
 * options to the database.
 *
 * @param props the field, the answer and the change callback.
 * @returns the options.
 */
export function ChoiceQuestion({ field, value, onChange, labelledBy }: Props) {
  const { t } = useTranslation();
  const multiple = field.type === DatabaseFieldType.MultipleSelect;
  const selected = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];
  const choices = field.options.choices ?? [];

  const handleToggle = (name: string) => {
    if (!multiple) {
      onChange(selected.includes(name) ? null : name);
      return;
    }
    const next = selected.includes(name)
      ? selected.filter((item) => item !== name)
      : [...selected, name];
    onChange(next.length ? next : null);
  };

  if (!choices.length) {
    return <Empty>{t("No option to choose from.")}</Empty>;
  }

  return (
    <Options
      role={multiple ? "group" : "radiogroup"}
      aria-labelledby={labelledBy}
    >
      {choices.map((choice) => {
        const isSelected = selected.includes(choice.name);
        return (
          <Option
            key={choice.id ?? choice.name}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={isSelected}
            $selected={isSelected}
            onClick={() => handleToggle(choice.name)}
          >
            <Mark $round={!multiple} $selected={isSelected} aria-hidden />
            <ChoicePill choice={choice} />
          </Option>
        );
      })}
    </Options>
  );
}

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Option = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 4px 10px;
  border: 1px solid
    ${(props) => (props.$selected ? props.theme.accent : props.theme.inputBorder)};
  border-radius: 8px;
  background: ${s("background")};
  font: inherit;
  text-align: start;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    border-color: ${s("accent")};
    outline: none;
  }
`;

const Mark = styled.span<{ $round: boolean; $selected: boolean }>`
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border: 1.5px solid
    ${(props) => (props.$selected ? props.theme.accent : props.theme.textTertiary)};
  border-radius: ${(props) => (props.$round ? "50%" : "3px")};
  background: ${(props) =>
    props.$selected ? props.theme.accent : "transparent"};
  box-shadow: inset 0 0 0 2px ${s("background")};
`;

const Empty = styled.span`
  color: ${s("textTertiary")};
  font-size: 14px;
`;

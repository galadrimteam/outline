import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { AutomationButton } from "../automations/AutomationButton";
import { CheckboxBox } from "./CheckboxCell";
import { NumberValue } from "./components/NumberValue";
import { CellText, EmptyValue } from "./components/styles";
import { cellValueToText, toArray } from "./format";
import { useCellLocale } from "./hooks";
import type { CellDefinition, CellRendererProps } from "./types";
import { PeopleChips, peopleOf } from "./UserCell";

/**
 * Values the engine computes (formula, rollup, auto number, created or modified time), drawn after
 * their value type: checkboxes for booleans, formatted numbers and dates, people as a person
 * property draws them, text otherwise.
 */
export const computedCell: CellDefinition = {
  Renderer: ComputedRenderer,
  isEditable: () => false,
};

/** Buttons, drawn with their label; clicking one runs the automations it triggers. */
export const buttonCell: CellDefinition = {
  Renderer: AutomationButton,
  isEditable: () => false,
};

function ComputedRenderer({ field, value, variant, wrap }: CellRendererProps) {
  const { t } = useTranslation();
  const locale = useCellLocale();

  if (field.cellValueType === "boolean") {
    const items = toArray(value);
    if (!items.length) {
      return <CheckboxBox checked={false} />;
    }
    return (
      <Row>
        {items.map((item, index) => (
          <CheckboxBox key={index} checked={item === true} />
        ))}
      </Row>
    );
  }

  const people = peopleOf(value);
  if (people.length) {
    return <PeopleChips people={people} variant={variant} wrap={wrap} />;
  }

  const text = cellValueToText(field, value, locale);
  if (!text) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  if (field.cellValueType === "number") {
    return (
      <NumberValue
        field={field}
        value={value}
        text={text}
        variant={variant}
        wrap={wrap}
      />
    );
  }

  return (
    <CellText $variant={variant} $wrap={wrap}>
      {text}
    </CellText>
  );
}

const Row = styled.span`
  display: inline-flex;
  gap: 4px;
`;

import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import { CheckboxBox } from "./CheckboxCell";
import { CellText, EmptyValue } from "./components/styles";
import { cellValueToText, toArray } from "./format";
import { useCellLocale } from "./hooks";
import type { CellDefinition, CellRendererProps } from "./types";

/**
 * Values the engine computes (formula, rollup, auto number, created or modified time), drawn after
 * their value type: checkboxes for booleans, formatted numbers and dates, text otherwise.
 */
export const computedCell: CellDefinition = {
  Renderer: ComputedRenderer,
  isEditable: () => false,
};

/** Buttons, drawn with their label; clicking them runs automations (later). */
export const buttonCell: CellDefinition = {
  Renderer: ButtonRenderer,
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

  const text = cellValueToText(field, value, locale);
  if (!text) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  return (
    <ComputedText
      $variant={variant}
      $wrap={wrap}
      $numeric={field.cellValueType === "number"}
    >
      {text}
    </ComputedText>
  );
}

function ButtonRenderer({ field }: CellRendererProps) {
  const { t } = useTranslation();
  return <ButtonLabel>{field.options.label ?? t("Button")}</ButtonLabel>;
}

const Row = styled.span`
  display: inline-flex;
  gap: 4px;
`;

const ComputedText = styled(CellText)<{ $numeric: boolean }>`
  font-variant-numeric: ${(props) => (props.$numeric ? "tabular-nums" : "normal")};
  text-align: ${(props) =>
    props.$numeric && props.$variant === "table" ? "right" : "left"};
`;

const ButtonLabel = styled.span`
  display: inline-block;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 22px;
  color: ${s("textSecondary")};
  border: 1px solid ${s("divider")};
`;

import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { CellText, EmptyValue, InlineInput } from "./components/styles";
import { isWritable } from "./editable";
import { cellValueToText, numberInputValue, parseNumberInput } from "./format";
import { useCellLocale, useCommitOnUnmount } from "./hooks";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** Numbers, formatted as decimal, percent or currency with the field's precision. */
export const numberCell: CellDefinition = {
  Renderer: NumberRenderer,
  Editor: NumberEditor,
  isEditable: isWritable,
};

function NumberRenderer({ field, value, variant, wrap }: CellRendererProps) {
  const { t } = useTranslation();
  const locale = useCellLocale();
  const text = cellValueToText(field, value, locale);

  if (!text) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  return (
    <NumberText $variant={variant} $wrap={wrap}>
      {text}
    </NumberText>
  );
}

function NumberEditor({ field, value, onChange, onClose }: CellEditorProps) {
  const formatting = field.options.formatting;
  const initial = numberInputValue(value, formatting);
  const [draft, setDraft] = React.useState(initial);

  useCommitOnUnmount(draft, (text) => {
    if (text.trim() === initial) {
      return;
    }
    const parsed = parseNumberInput(text, formatting);
    if (parsed === null && text.trim() !== "") {
      return;
    }
    onChange(parsed);
  });

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft(event.target.value),
    []
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  return (
    <NumberInput
      autoFocus
      inputMode="decimal"
      value={draft}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={onClose}
    />
  );
}

const NumberText = styled(CellText)`
  font-variant-numeric: tabular-nums;
  text-align: ${(props) => (props.$variant === "table" ? "right" : "left")};
`;

const NumberInput = styled(InlineInput)`
  font-variant-numeric: tabular-nums;
`;

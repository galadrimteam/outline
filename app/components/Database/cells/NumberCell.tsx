import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { NumberValue } from "./components/NumberValue";
import { EmptyValue, InlineInput } from "./components/styles";
import { isWritable } from "./editable";
import { cellValueToText, numberInputValue, parseNumberInput } from "./format";
import { moveCaretToEnd, useCellLocale, useCommitOnUnmount } from "./hooks";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** Numbers, formatted as decimal, percent or currency with the field's precision, as a ring or a bar when asked. */
export const numberCell: CellDefinition = {
  Renderer: NumberRenderer,
  Editor: NumberEditor,
  isEditable: isWritable,
  opensOnTyping: true,
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
    <NumberValue
      field={field}
      value={value}
      text={text}
      variant={variant}
      wrap={wrap}
    />
  );
}

function NumberEditor({
  field,
  value,
  onChange,
  onClose,
  initialInput,
}: CellEditorProps) {
  const formatting = field.options.formatting;
  const initial = numberInputValue(value, formatting);
  const [draft, setDraft] = React.useState(initialInput ?? initial);

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
      onFocus={moveCaretToEnd}
    />
  );
}

const NumberInput = styled(InlineInput)`
  font-variant-numeric: tabular-nums;
`;

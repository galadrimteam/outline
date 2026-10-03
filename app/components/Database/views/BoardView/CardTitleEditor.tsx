import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";

interface Props {
  /** The title when the edit starts. */
  value: string;
  /** Saves the title, only when it changed. */
  onSave: (title: string) => void;
  /** Called once when the edit ends, saved or not. */
  onClose: () => void;
}

/**
 * The title of a board card typed in place, as Notion's ✎ on a card: Enter,
 * Escape or a click elsewhere keep the text, as everywhere else in a database.
 */
export function CardTitleEditor({ value, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [text, setText] = React.useState(value);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const doneRef = React.useRef(false);

  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    fitHeight(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const finish = React.useCallback(() => {
    if (doneRef.current) {
      return;
    }
    doneRef.current = true;
    if (text !== value) {
      onSave(text);
    }
    onClose();
  }, [text, value, onSave, onClose]);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
      fitHeight(event.target);
    },
    []
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // The card would take Space as picking it up and Enter as opening it.
      event.stopPropagation();
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (
        (event.key === "Enter" && !event.shiftKey) ||
        event.key === "Escape"
      ) {
        event.preventDefault();
        finish();
      }
    },
    [finish]
  );

  return (
    <Input
      ref={inputRef}
      rows={1}
      value={text}
      placeholder={t("Untitled")}
      aria-label={t("Card name")}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={finish}
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onClick={stopPropagation}
    />
  );
}

function fitHeight(input: HTMLTextAreaElement) {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

const Input = styled.textarea`
  display: block;
  flex: 1;
  min-width: 0;
  resize: none;
  overflow: hidden;
  border: 0;
  outline: none;
  padding: 0;
  margin: 0;
  background: transparent;
  color: ${s("text")};
  font: inherit;
  cursor: text;
  user-select: text;

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

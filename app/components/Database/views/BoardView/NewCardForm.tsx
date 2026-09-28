import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";

interface Props {
  /** Creates the card; the form stays open for the next one. */
  onSubmit: (title: string) => Promise<void>;
  onClose: () => void;
}

/**
 * The card being typed at the top or bottom of a column, like Notion's
 * « + New »: Enter creates it and starts the next one, Escape stops.
 */
export function NewCardForm({ onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const submittingRef = React.useRef(false);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = React.useCallback(
    async (keepOpen: boolean) => {
      const value = title.trim();
      if (!value || submittingRef.current) {
        if (!keepOpen) {
          onClose();
        }
        return;
      }
      submittingRef.current = true;
      setTitle("");
      try {
        await onSubmit(value);
      } finally {
        submittingRef.current = false;
      }
      if (keepOpen) {
        inputRef.current?.focus();
      } else {
        onClose();
      }
    },
    [title, onSubmit, onClose]
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      event.stopPropagation();
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submit(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [submit, onClose]
  );

  const handleBlur = React.useCallback(() => {
    void submit(false);
  }, [submit]);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTitle(event.target.value);
      event.target.style.height = "auto";
      event.target.style.height = `${event.target.scrollHeight}px`;
    },
    []
  );

  return (
    <Wrapper>
      <Input
        ref={inputRef}
        rows={1}
        value={title}
        placeholder={t("Type a name…")}
        aria-label={t("Card name")}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </Wrapper>
  );
}

const Wrapper = styled.div`
  border-radius: 8px;
  background: ${(props) => (props.theme.isDark ? "#252525" : props.theme.background)};
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "rgba(255, 255, 255, 0.094) 0 0 0 1px, rgba(0, 0, 0, 0.2) 0 2px 4px"
      : "rgba(15, 15, 15, 0.1) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 2px 4px"};
  padding: 8px 10px;
`;

const Input = styled.textarea`
  display: block;
  width: 100%;
  resize: none;
  overflow: hidden;
  border: 0;
  outline: none;
  padding: 0;
  background: transparent;
  color: ${s("text")};
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

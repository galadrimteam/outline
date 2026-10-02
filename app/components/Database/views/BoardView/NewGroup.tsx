import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseField } from "@shared/databases/types";
import { s, hover } from "@shared/styles";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { appendChoice, hasChoice } from "../../cells/choices";
import { borderBox } from "./styles";

interface Props {
  database: Database;
  field: DatabaseField;
}

/**
 * Notion's « + New group » at the end of a board: adds an option to the
 * property the board is grouped by.
 */
export const NewGroup = observer(function NewGroup({ database, field }: Props) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const [isEditing, setIsEditing] = React.useState(false);
  const [name, setName] = React.useState("");

  const close = React.useCallback(() => {
    setIsEditing(false);
    setName("");
  }, []);

  const submit = React.useCallback(async () => {
    const value = name.trim();
    const choices = field.options.choices ?? [];
    if (!value || hasChoice(choices, value)) {
      close();
      return;
    }
    close();
    try {
      await databases.convertField(database.id, field.id, field.type, {
        ...field.options,
        choices: appendChoice(choices, value),
      });
    } catch (_err) {
      toast.error(t("Couldn’t add the group"));
    }
  }, [name, field, databases, database.id, close, t]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    },
    [submit, close]
  );

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    []
  );

  const handleBlur = React.useCallback(() => void submit(), [submit]);
  const handleStart = React.useCallback(() => setIsEditing(true), []);

  if (isEditing) {
    return (
      <Wrapper>
        <Input
          autoFocus
          value={name}
          placeholder={t("Group name")}
          aria-label={t("Group name")}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Button type="button" onClick={handleStart}>
        <PlusIcon size={18} />
        {t("New group")}
      </Button>
    </Wrapper>
  );
});

const Wrapper = styled.div`
  flex: 0 0 200px;
  padding-top: 8px;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textTertiary")};
  font: inherit;
  font-size: 14px;
  cursor: var(--pointer);

  &:${hover} {
    background: ${(props) =>
      props.theme.isDark
        ? "rgba(255, 255, 255, 0.06)"
        : "rgba(55, 53, 47, 0.06)"};
    color: ${s("textSecondary")};
  }
`;

const Input = styled.input`
  ${borderBox}
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid ${s("inputBorderFocused")};
  border-radius: 6px;
  background: ${s("background")};
  color: ${s("text")};
  font: inherit;
  font-size: 14px;
  outline: none;
`;

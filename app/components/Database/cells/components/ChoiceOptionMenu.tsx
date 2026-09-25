import { observer } from "mobx-react";
import { TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import type {
  DatabaseField,
  DatabaseSelectChoice,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import type { DatabaseTone } from "../../colors";
import { toneColors, toneOf } from "../../colors";
import {
  CHOICE_COLORS,
  isStatusField,
  removeChoice,
  renameStatusChoice,
  updateChoice,
} from "../choices";
import { saveChoices } from "../saveChoices";
import { PopoverHeading, PopoverItem } from "./styles";

interface Props {
  database: Database;
  field: DatabaseField;
  choice: DatabaseSelectChoice;
  /** The button that opens the menu. */
  children: React.ReactElement;
}

/**
 * The menu of one select option: rename, recolour, delete. Every change converts the field with
 * its new options; the engine keeps the option ids, so rows follow a rename.
 *
 * @param props the option and the button that opens the menu.
 * @returns the menu.
 */
export const ChoiceOptionMenu = observer(function ChoiceOptionMenu_({
  database,
  field,
  choice,
  children,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const stores = useStores();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(choice.name);
  const status = isStatusField(field);
  const choices = React.useMemo(
    () => field.options.choices ?? [],
    [field.options.choices]
  );

  const toneLabel = (tone: DatabaseTone) => {
    switch (tone) {
      case "gray":
        return t("Gray");
      case "brown":
        return t("Brown");
      case "orange":
        return t("Orange");
      case "yellow":
        return t("Yellow");
      case "green":
        return t("Green");
      case "teal":
        return t("Teal");
      case "blue":
        return t("Blue");
      case "purple":
        return t("Purple");
      case "pink":
        return t("Pink");
      case "red":
        return t("Red");
      default:
        return t("Default");
    }
  };

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        setName(choice.name);
      }
      setOpen(next);
    },
    [choice.name]
  );

  const handleRename = React.useCallback(async () => {
    const next = name.trim();
    if (!next || next === choice.name) {
      return;
    }
    await saveChoices(
      stores,
      database,
      field,
      updateChoice(choices, choice.name, { name: next }),
      status
        ? renameStatusChoice(field.meta?.statusGroups ?? {}, choice.name, next)
        : undefined
    );
  }, [choice.name, choices, database, field, name, status, stores]);

  const handleRecolor = React.useCallback(
    (color: string) => {
      void saveChoices(
        stores,
        database,
        field,
        updateChoice(choices, choice.name, { color })
      );
    },
    [choice.name, choices, database, field, stores]
  );

  const handleDelete = React.useCallback(() => {
    setOpen(false);
    void saveChoices(
      stores,
      database,
      field,
      removeChoice(choices, choice.name),
      status
        ? renameStatusChoice(field.meta?.statusGroups ?? {}, choice.name, null)
        : undefined
    );
  }, [choice.name, choices, database, field, status, stores]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        void handleRename();
        setOpen(false);
      }
    },
    [handleRename]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>{children}</PopoverTrigger>
      <Content
        aria-label={t("Edit option")}
        side="right"
        align="start"
        width={220}
        shrink
        onClick={(event) => event.stopPropagation()}
      >
        <NameInput
          autoFocus
          aria-label={t("Option name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void handleRename()}
        />
        <PopoverItem role="button" onClick={handleDelete}>
          <TrashIcon size={18} />
          {t("Delete")}
        </PopoverItem>
        <PopoverHeading>{t("Colors")}</PopoverHeading>
        {CHOICE_COLORS.map((color) => (
          <PopoverItem
            key={color}
            role="menuitemradio"
            aria-checked={toneOf(choice.color) === toneOf(color)}
            onClick={() => handleRecolor(color)}
          >
            <Swatch
              style={{ background: toneColors(color, theme).background }}
            />
            {toneLabel(toneOf(color))}
            {toneOf(choice.color) === toneOf(color) && (
              <Check aria-hidden>✓</Check>
            )}
          </PopoverItem>
        ))}
      </Content>
    </Popover>
  );
});

const Content = styled(PopoverContent)`
  padding: 4px 0;
`;

const NameInput = styled.input`
  display: block;
  width: calc(100% - 16px);
  margin: 4px 8px 6px;
  padding: 4px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  outline: none;
  font: inherit;
  font-size: 14px;
  color: ${s("text")};
  background: ${s("background")};

  &:focus {
    border-color: ${s("inputBorderFocused")};
  }
`;

const Swatch = styled.span`
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
`;

const Check = styled.span`
  margin-left: auto;
  color: ${s("textSecondary")};
`;

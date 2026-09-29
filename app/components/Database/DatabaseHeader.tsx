import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css } from "styled-components";
import Icon from "@shared/components/Icon";
import { colorPalette } from "@shared/constants";
import { s } from "@shared/styles";
import IconPicker from "~/components/IconPicker";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";

interface Props {
  database: Database;
  readOnly: boolean;
  /** Drawn as the heading of a full page database. */
  fullPage: boolean;
}

/**
 * The icon and the name of a database, both editable in place like a Notion
 * database title.
 */
export const DatabaseHeader = observer(function DatabaseHeader({
  database,
  readOnly,
  fullPage,
}: Props) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const [title, setTitle] = React.useState(database.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setTitle(database.title);
    }
  }, [database.title]);

  const save = React.useCallback(async () => {
    const value = title.trim();
    if (value === database.title) {
      return;
    }
    try {
      await databases.update(database.id, { title: value });
    } catch (_err) {
      setTitle(database.title);
      toast.error(t("Couldn’t rename the database"));
    }
  }, [title, database, databases, t]);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setTitle(event.target.value),
    []
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        inputRef.current?.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setTitle(database.title);
        requestAnimationFrame(() => inputRef.current?.blur());
      }
    },
    [database.title]
  );

  const handleBlur = React.useCallback(() => void save(), [save]);

  const handleIconChange = React.useCallback(
    (icon: string | null) => {
      databases
        .update(database.id, { icon })
        .catch(() => toast.error(t("Couldn’t change the icon")));
    },
    [databases, database.id, t]
  );

  const iconSize = fullPage ? 32 : 22;
  const initial = (database.title || "D").charAt(0).toUpperCase();

  return (
    <Wrapper $fullPage={fullPage}>
      {readOnly ? (
        database.icon && (
          <IconSlot>
            <Icon
              value={database.icon}
              color={colorPalette[0]}
              size={iconSize}
              initial={initial}
            />
          </IconSlot>
        )
      ) : (
        <IconSlot $placeholder={!database.icon}>
          <IconPicker
            icon={database.icon}
            color={colorPalette[0]}
            size={iconSize}
            initial={initial}
            popoverPosition="bottom-start"
            allowDelete
            onChange={handleIconChange}
          />
        </IconSlot>
      )}
      {readOnly ? (
        <Title
          as="div"
          role="heading"
          aria-level={2}
          $fullPage={fullPage}
          $empty={!database.title}
        >
          {database.title || t("Untitled")}
        </Title>
      ) : (
        <Title
          ref={inputRef}
          $fullPage={fullPage}
          $empty={!title}
          value={title}
          placeholder={t("Untitled")}
          aria-label={t("Database name")}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      )}
    </Wrapper>
  );
});

const Wrapper = styled.div<{ $fullPage: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-bottom: ${(props) => (props.$fullPage ? 12 : 4)}px;
`;

const IconSlot = styled.div<{ $placeholder?: boolean }>`
  display: flex;
  flex-shrink: 0;

  ${(props) =>
    props.$placeholder &&
    css`
      opacity: 0;
      transition: opacity 100ms ease-in-out;

      ${Wrapper}:hover &,
      &:focus-within {
        opacity: 1;
      }
    `}
`;

const Title = styled.input<{ $fullPage: boolean; $empty: boolean }>`
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 2px 0;
  border: 0;
  outline: none;
  background: none;
  color: ${(props) => (props.$empty ? props.theme.placeholder : props.theme.text)};
  font: inherit;
  font-size: ${(props) => (props.$fullPage ? 32 : 20)}px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

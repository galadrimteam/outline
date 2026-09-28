import { observer } from "mobx-react";
import { DatabaseIcon, PlusIcon, SearchIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import Icon from "@shared/components/Icon";
import { colorPalette } from "@shared/constants";
import { s } from "@shared/styles";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";

interface Props {
  /** Focuses the search at once, when the block was just inserted to link a database. */
  autoFocus: boolean;
  onSelect: (database: Database) => void;
  /** Creates a new database in the block instead. */
  onCreate?: () => void;
}

/**
 * Notion's « Select data source » of a linked view: searches the databases
 * the reader can open and points the block at the chosen one.
 */
export const DatabasePicker = observer(function DatabasePicker({
  autoFocus,
  onSelect,
  onCreate,
}: Props) {
  const { t } = useTranslation();
  const { databases, collections } = useStores();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Database[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(() => {
      databases
        .list({ query: query.trim() || undefined, limit: 25 })
        .then((items) => {
          if (!cancelled) {
            setResults([...items]);
            setActiveIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [databases, query]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const database = results[activeIndex];
        if (database) {
          onSelect(database);
        }
      }
    },
    [results, activeIndex, onSelect]
  );

  return (
    <Wrapper>
      <Heading>{t("Select a database to show here")}</Heading>
      <Search>
        <SearchIcon size={18} />
        <SearchInput
          autoFocus={autoFocus}
          value={query}
          placeholder={t("Search databases…")}
          aria-label={t("Search databases")}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={
            results[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </Search>
      <List id={listId} role="listbox" aria-label={t("Databases")}>
        {results.map((database, index) => (
          <Option
            key={database.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            $active={index === activeIndex}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => onSelect(database)}
          >
            {database.icon ? (
              <Icon
                value={database.icon}
                color={colorPalette[0]}
                size={18}
                initial={(database.title || "D").charAt(0)}
              />
            ) : (
              <DatabaseIcon size={18} />
            )}
            <OptionTitle>{database.title || t("Untitled")}</OptionTitle>
            <OptionMeta>
              {collections.get(database.collectionId)?.name ?? ""}
            </OptionMeta>
          </Option>
        ))}
        {!isLoading && results.length === 0 && (
          <Empty>{t("No database found")}</Empty>
        )}
      </List>
      {onCreate && (
        <CreateButton type="button" onClick={onCreate}>
          <PlusIcon size={18} />
          {t("New database")}
        </CreateButton>
      )}
    </Wrapper>
  );
});

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 420px;
  padding: 10px;
  border: 1px solid ${s("divider")};
  border-radius: 10px;
  background: ${s("background")};
`;

const Heading = styled.div`
  padding: 2px 4px;
  color: ${s("textTertiary")};
  font-size: 13px;
  font-weight: 500;
`;

const Search = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  background: ${s("inputBackground")};
  color: ${s("textTertiary")};
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: none;
  color: ${s("text")};
  font: inherit;
  font-size: 14px;

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
`;

const Option = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  color: ${s("text")};
  font-size: 14px;
  cursor: var(--pointer);

  ${(props) =>
    props.$active &&
    css`
      background: ${props.theme.listItemHoverBackground};
    `}
`;

const OptionTitle = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const OptionMeta = styled.span`
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  color: ${s("textTertiary")};
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Empty = styled.div`
  padding: 8px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

const CreateButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-top: 1px solid ${s("divider")};
  background: none;
  color: ${s("textSecondary")};
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: var(--pointer);

  &:hover {
    color: ${s("text")};
  }
`;

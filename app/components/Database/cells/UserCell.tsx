import { observer } from "mobx-react";
import { CloseIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseField,
  DatabaseUserInput,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s } from "@shared/styles";
import { Avatar, AvatarSize } from "~/components/Avatar";
import NudeButton from "~/components/NudeButton";
import useStores from "~/hooks/useStores";
import type User from "~/models/User";
import { EditorPopover } from "./components/EditorPopover";
import {
  Chips,
  EmptyValue,
  PopoverItem,
  PopoverList,
  SearchInput,
} from "./components/styles";
import { isWritable } from "./editable";
import { isUserItem, toArray } from "./format";
import { moveCaretToEnd, useDebouncedValue, useListNavigation } from "./hooks";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** People: Outline members in person fields, the author or last editor in created/modified by. */
export const userCell: CellDefinition = {
  Renderer: observer(UserRenderer),
  Editor: observer(UserEditor),
  isEditable: (field) =>
    field.type === DatabaseFieldType.User && isWritable(field),
  opensOnTyping: true,
};

/**
 * The people of a person cell.
 *
 * @param value the cell value.
 * @returns the people, in order.
 */
export function usersOf(
  value: CellRendererProps["value"]
): DatabaseUserValue[] {
  return toArray(value).filter(isUserItem);
}

/**
 * The people a value holds, eg a rollup of a person property, when it holds people only.
 *
 * @param value the cell value.
 * @returns the people, empty when the value holds anything else.
 */
export function peopleOf(
  value: CellRendererProps["value"]
): DatabaseUserValue[] {
  const items = toArray(value);
  const people = items.filter(
    (item): item is DatabaseUserValue =>
      isUserItem(item) && ("email" in item || "outlineUserId" in item)
  );
  return people.length === items.length ? people : [];
}

function UserRenderer({ value, variant, wrap }: CellRendererProps) {
  const { t } = useTranslation();
  const people = usersOf(value);

  if (!people.length) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  return <PeopleChips people={people} variant={variant} wrap={wrap} />;
}

interface PeopleProps {
  people: DatabaseUserValue[];
  /** Draws the avatars alone, as on Notion's timeline bars. */
  avatarsOnly?: boolean;
}

/**
 * People as a person cell draws them: an avatar and a name each.
 *
 * @param props the people and where they are drawn.
 * @returns the chips.
 */
export function PeopleChips({
  people,
  variant,
  wrap,
  avatarsOnly,
}: PeopleProps & Pick<CellRendererProps, "variant" | "wrap">) {
  return (
    <Chips $variant={variant} $wrap={wrap}>
      {people.map((person) => (
        <Person key={person.id} person={person} avatarOnly={avatarsOnly} />
      ))}
    </Chips>
  );
}

const Person = observer(function Person_({
  person,
  avatarOnly,
}: {
  person: DatabaseUserValue;
  avatarOnly?: boolean;
}) {
  const { users } = useStores();
  const user = person.outlineUserId
    ? users.get(person.outlineUserId)
    : undefined;
  const name = user?.name ?? person.title;

  return (
    <PersonChip>
      <Avatar
        size={AvatarSize.Small}
        model={
          user ?? {
            avatarUrl: person.avatarUrl ?? null,
            initial: name.charAt(0).toUpperCase(),
            name,
          }
        }
        alt={name}
        showTooltip={avatarOnly}
      />
      {!avatarOnly && <PersonName>{name}</PersonName>}
    </PersonChip>
  );
});

function UserEditor(props: CellEditorProps) {
  const { field, value, onChange, onClose, initialInput } = props;
  const { t } = useTranslation();
  const { users } = useStores();
  const [query, setQuery] = React.useState(initialInput ?? "");
  const settledQuery = useDebouncedValue(query);
  const multiple = isMultiplePerson(field);
  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    usersOf(value)
      .map((person) => person.outlineUserId)
      .filter((id): id is string => !!id)
  );

  React.useEffect(() => {
    void users.fetchPage({ query: settledQuery, limit: 25 });
  }, [users, settledQuery]);

  const candidates = users
    .findByQuery(query, { maxResults: 25 })
    .filter((user: User) => !user.isSuspended);

  const write = React.useCallback(
    (ids: string[]) => {
      const input: DatabaseUserInput[] = ids.map((outlineUserId) => ({
        outlineUserId,
      }));
      onChange(input.length ? input : null);
    },
    [onChange]
  );

  const handleToggle = React.useCallback(
    (user: User) => {
      if (!multiple) {
        const next = selectedIds.includes(user.id) ? [] : [user.id];
        setSelectedIds(next);
        write(next);
        onClose();
        return;
      }
      const next = selectedIds.includes(user.id)
        ? selectedIds.filter((id) => id !== user.id)
        : [...selectedIds, user.id];
      setSelectedIds(next);
      setQuery("");
      write(next);
    },
    [multiple, onClose, selectedIds, write]
  );

  const handleRemove = React.useCallback(
    (id: string) => {
      const next = selectedIds.filter((selected) => selected !== id);
      setSelectedIds(next);
      write(next);
    },
    [selectedIds, write]
  );

  const handlePick = React.useCallback(
    (index: number) => {
      const user = candidates[index];
      if (user) {
        handleToggle(user);
      }
    },
    [candidates, handleToggle]
  );

  const { active, setActive, handleKeyDown } = useListNavigation(
    candidates.length,
    handlePick,
    { query, onEnterWithoutPick: onClose }
  );

  const handleSearchKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !query && selectedIds.length) {
        handleRemove(selectedIds[selectedIds.length - 1]);
        return;
      }
      handleKeyDown(event);
    },
    [handleKeyDown, handleRemove, query, selectedIds]
  );

  return (
    <EditorPopover
      anchor={<UserRenderer {...props} />}
      label={t("Edit people")}
      onClose={onClose}
    >
      {selectedIds.length > 0 && (
        <Selected>
          {selectedIds.map((id) => {
            const user = users.get(id);
            return (
              <SelectedChip key={id}>
                {user && <Avatar size={AvatarSize.Small} model={user} />}
                <PersonName>{user?.name ?? id}</PersonName>
                <NudeButton
                  size={16}
                  aria-label={t("Remove")}
                  onClick={() => handleRemove(id)}
                >
                  <CloseIcon size={16} />
                </NudeButton>
              </SelectedChip>
            );
          })}
        </Selected>
      )}
      <SearchInput
        autoFocus
        placeholder={t("Search for a person…")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleSearchKeyDown}
        onFocus={moveCaretToEnd}
      />
      <PopoverList role="listbox" aria-multiselectable={multiple}>
        {candidates.map((user, index) => (
          <PopoverItem
            key={user.id}
            role="option"
            aria-selected={index === active}
            aria-checked={selectedIds.includes(user.id)}
            onMouseEnter={() => setActive(index)}
            onClick={() => handleToggle(user)}
          >
            <Avatar
              size={AvatarSize.Medium}
              model={user}
              showHoverCard={false}
            />
            <PersonName>{user.name}</PersonName>
            {selectedIds.includes(user.id) && <Check>✓</Check>}
          </PopoverItem>
        ))}
        {!candidates.length && <NoResult>{t("No people found")}</NoResult>}
      </PopoverList>
    </EditorPopover>
  );
}

function isMultiplePerson(field: DatabaseField): boolean {
  return field.options.isMultiple ?? field.isMultipleCellValue;
}

const PersonChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-shrink: 0;
  max-width: 100%;
`;

const PersonName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${s("text")};
`;

const Selected = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px 0;
`;

const SelectedChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 2px;
  border-radius: 12px;
  font-size: 13px;
  background: ${s("backgroundSecondary")};
`;

const Check = styled.span`
  margin-left: auto;
  color: ${s("textSecondary")};
`;

const NoResult = styled.div`
  padding: 8px 12px;
  font-size: 14px;
  color: ${s("textTertiary")};
`;

import { observer } from "mobx-react";
import { CloseIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseField,
  DatabaseSelectChoice,
} from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import useStores from "~/hooks/useStores";
import {
  appendChoice,
  filterChoices,
  groupChoices,
  hasChoice,
  isStatusField,
  renameStatusChoice,
} from "./choices";
import { ChoiceOptionsList } from "./components/ChoiceOptionsList";
import { ChoicePill } from "./components/ChoicePill";
import { EditorPopover } from "./components/EditorPopover";
import {
  Chips,
  EmptyValue,
  PopoverHeading,
  PopoverItem,
  SearchInput,
} from "./components/styles";
import { isWritable } from "./editable";
import { toArray } from "./format";
import { moveCaretToEnd, useListNavigation } from "./hooks";
import { saveChoices } from "./saveChoices";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** Single select, multi select and status: coloured pills. */
export const selectCell: CellDefinition = {
  Renderer: SelectRenderer,
  Editor: observer(SelectEditor),
  isEditable: isWritable,
  opensOnTyping: true,
};

/**
 * The option names of a select cell.
 *
 * @param value the cell value.
 * @returns the names, in order.
 */
export function selectedNames(value: CellRendererProps["value"]): string[] {
  return toArray(value).filter(
    (item): item is string => typeof item === "string" && item !== ""
  );
}

/**
 * The option of a field with this name, or a grey stand-in for a value that is no longer an
 * option.
 *
 * @param field the select field.
 * @param name the option name.
 * @returns the option.
 */
export function choiceOf(
  field: DatabaseField,
  name: string
): DatabaseSelectChoice {
  return (
    field.options.choices?.find((choice) => choice.name === name) ?? {
      name,
      color: "grayLight2",
    }
  );
}

function SelectRenderer({ field, value, variant, wrap }: CellRendererProps) {
  const { t } = useTranslation();
  const names = selectedNames(value);
  const status = isStatusField(field);

  if (!names.length) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  return (
    <Chips $variant={variant} $wrap={wrap}>
      {names.map((name, index) => (
        <ChoicePill
          key={`${name}-${index}`}
          choice={choiceOf(field, name)}
          status={status}
        />
      ))}
    </Chips>
  );
}

function SelectEditor(props: CellEditorProps) {
  const { database, field, value, onChange, onClose, initialInput } = props;
  const { t } = useTranslation();
  const stores = useStores();
  const multiple = field.type === DatabaseFieldType.MultipleSelect;
  const status = isStatusField(field);
  const choices = React.useMemo(
    () => field.options.choices ?? [],
    [field.options.choices]
  );
  const [selected, setSelected] = React.useState(() => selectedNames(value));
  const [query, setQuery] = React.useState(initialInput ?? "");
  const [creating, setCreating] = React.useState(false);

  const sections = status
    ? groupChoices(filterChoices(choices, query), field.meta?.statusGroups)
    : [{ group: null, choices: filterChoices(choices, query) }];
  const visible = sections.flatMap((section) => section.choices);
  const canCreate = !!query.trim() && !hasChoice(choices, query) && !creating;
  const itemCount = visible.length + (canCreate ? 1 : 0);

  const write = React.useCallback(
    (names: string[]) => {
      setSelected(names);
      if (multiple) {
        onChange(names.length ? names : null);
        return;
      }
      onChange(names[0] ?? null);
    },
    [multiple, onChange]
  );

  const handleToggle = React.useCallback(
    (name: string) => {
      const isSelected = selected.includes(name);
      if (!multiple) {
        write(isSelected ? [] : [name]);
        onClose();
        return;
      }
      write(
        isSelected
          ? selected.filter((item) => item !== name)
          : [...selected, name]
      );
      setQuery("");
    },
    [multiple, onClose, selected, write]
  );

  const handleCreate = React.useCallback(async () => {
    const name = query.trim();
    if (!name) {
      return;
    }
    setCreating(true);
    const saved = await saveChoices(
      stores,
      database,
      field,
      appendChoice(choices, name),
      status
        ? renameStatusChoice(
            field.meta?.statusGroups ?? {},
            null,
            name,
            DatabaseStatusGroup.ToDo
          )
        : undefined
    );
    setCreating(false);
    if (!saved) {
      return;
    }
    setQuery("");
    if (multiple) {
      write([...selected, name]);
      return;
    }
    write([name]);
    onClose();
  }, [
    choices,
    database,
    field,
    multiple,
    onClose,
    query,
    selected,
    status,
    stores,
    write,
  ]);

  const handlePick = React.useCallback(
    (index: number) => {
      if (index < visible.length) {
        handleToggle(visible[index].name);
        return;
      }
      void handleCreate();
    },
    [handleCreate, handleToggle, visible]
  );

  const { active, setActive, handleKeyDown } = useListNavigation(
    itemCount,
    handlePick,
    { query, onEnterWithoutPick: onClose }
  );

  const handleSearchKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !query && selected.length) {
        write(selected.slice(0, -1));
        return;
      }
      handleKeyDown(event);
    },
    [handleKeyDown, query, selected, write]
  );

  return (
    <EditorPopover
      anchor={<SelectRenderer {...props} />}
      label={t("Edit options")}
      onClose={onClose}
    >
      <SearchArea>
        {selected.map((name) => (
          <SelectedPill key={name}>
            <ChoicePill choice={choiceOf(field, name)} status={status} />
            <NudeButton
              size={16}
              aria-label={t("Remove")}
              onClick={() => write(selected.filter((item) => item !== name))}
            >
              <CloseIcon size={14} />
            </NudeButton>
          </SelectedPill>
        ))}
        <SearchField
          autoFocus
          placeholder={selected.length ? "" : t("Search for an option…")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          onFocus={moveCaretToEnd}
        />
      </SearchArea>
      <PopoverHeading>{t("Select an option or create one")}</PopoverHeading>
      <ChoiceOptionsList
        database={database}
        field={field}
        sections={sections}
        selected={selected}
        activeName={visible[active]?.name}
        reorderable={!query}
        onHover={(name) =>
          setActive(visible.findIndex((choice) => choice.name === name))
        }
        onToggle={handleToggle}
      />
      {canCreate && (
        <CreateItem
          role="option"
          aria-selected={active === visible.length}
          onMouseEnter={() => setActive(visible.length)}
          onClick={() => void handleCreate()}
        >
          <span>{t("Create")}</span>
          <ChoicePill
            choice={{ name: query.trim(), color: "grayLight2" }}
            status={status}
          />
        </CreateItem>
      )}
    </EditorPopover>
  );
}

const SearchArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: ${s("backgroundSecondary")};
  border-bottom: 1px solid ${s("divider")};
`;

const SearchField = styled(SearchInput)`
  flex: 1;
  min-width: 80px;
  width: auto;
  padding: 2px 4px;
  border: 0;
  background: transparent;
`;

const SelectedPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
`;

const CreateItem = styled(PopoverItem)`
  margin-bottom: 4px;
`;

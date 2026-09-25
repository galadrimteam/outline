import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckmarkIcon, ExpandedIcon } from "outline-icons";
import * as React from "react";
import styled, { css } from "styled-components";
import { borderRadius, depths, ellipsis, s } from "@shared/styles";
import type { DatabaseField } from "@shared/databases/types";
import { fadeAndSlideDown } from "~/styles/animations";
import { FieldKindIcon } from "../fields/FieldKindIcon";

/** A button of the view toolbar: an icon, a label hidden on narrow blocks, and the accent colour when something is active. */
export const ToolbarButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${(props) =>
    props.$active ? props.theme.accent : props.theme.textTertiary};
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: var(--pointer);
  user-select: none;

  &:hover,
  &[data-state="open"] {
    background: ${s("listItemHoverBackground")};
    color: ${(props) => (props.$active ? props.theme.accent : props.theme.text)};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: -2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  svg {
    flex-shrink: 0;
  }
`;

/** A text button of a popover footer, like Notion's "+ Add filter rule". */
export const PanelAction = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${(props) =>
    props.$danger ? props.theme.danger : props.theme.textSecondary};
  font-size: 14px;
  text-align: start;
  cursor: var(--pointer);

  &:hover:not(:disabled),
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${(props) => (props.$danger ? props.theme.danger : props.theme.text)};
    outline: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

/** A row of a settings list: label on the left, current value and chevron on the right. */
export const PanelRow = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${s("text")};
  font-size: 14px;
  text-align: start;
  cursor: var(--pointer);

  &:hover:not(:disabled),
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    outline: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  svg {
    flex-shrink: 0;
    color: ${s("textTertiary")};
  }
`;

/** The label part of a `PanelRow`, taking the free width. */
export const RowLabel = styled.span`
  flex: 1;
  min-width: 0;
  ${ellipsis()}
`;

/** The value part of a `PanelRow`, greyed. */
export const RowValue = styled.span`
  max-width: 50%;
  color: ${s("textTertiary")};
  ${ellipsis()}
`;

/** The heading of a popover panel. */
export const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 8px 6px;
  color: ${s("textTertiary")};
  font-size: 12px;
  font-weight: 600;
`;

/** A thin line between panel sections. */
export const PanelDivider = styled.hr`
  margin: 6px 0;
  border: 0;
  border-top: 1px solid ${s("divider")};
`;

/** A hint shown when a panel has nothing to list. */
export const PanelEmpty = styled.p`
  margin: 4px 8px 8px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

/** A compact text input, used for filter values and searches. */
export const SmallInput = styled.input`
  height: 28px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid ${s("inputBorder")};
  ${borderRadius(6)}
  background: ${s("inputBackground")};
  color: ${s("text")};
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: ${s("inputBorderFocused")};
  }

  &::placeholder {
    color: ${s("placeholder")};
  }

  &:disabled {
    opacity: 0.6;
  }
`;

/** A draggable handle, visible when its row is hovered or focused. */
export const DragHandle = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 24px;
  padding: 0;
  border: 0;
  ${borderRadius(4)}
  background: none;
  color: ${s("textTertiary")};
  cursor: grab;
  touch-action: none;

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
    outline: none;
  }
`;

/** An option of a `CompactSelect`. */
export interface CompactOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface CompactSelectProps<T extends string> {
  /** The selected value. */
  value: T | undefined;
  /** The options, in order. */
  options: CompactOption<T>[];
  /** Called with the chosen value. */
  onChange: (value: T) => void;
  /** Accessible name of the select. */
  ariaLabel: string;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Disables the select. */
  disabled?: boolean;
  /** Draws the trigger without a border. */
  borderless?: boolean;
  /** Fixed width of the trigger in pixels. */
  width?: number;
}

/**
 * A compact select for popovers (field, operator, conjunction…), keyboard
 * accessible through Radix.
 *
 * @param props the select props.
 * @returns the select.
 */
export function CompactSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  disabled,
  borderless,
  width,
}: CompactSelectProps<T>) {
  const selected = options.find((option) => option.value === value);
  const handleValueChange = React.useCallback(
    (next: string) => {
      const option = options.find((o) => o.value === next);
      if (option) {
        onChange(option.value);
      }
    },
    [options, onChange]
  );

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        $borderless={borderless}
        style={width ? { width } : undefined}
      >
        {selected?.icon}
        <TriggerLabel>
          {selected ? selected.label : (placeholder ?? "")}
        </TriggerLabel>
        <ExpandedIcon size={16} />
      </SelectTrigger>
      <SelectPrimitive.Portal>
        <SelectContent position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.icon}
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator asChild>
                  <Indicator>
                    <CheckmarkIcon size={16} />
                  </Indicator>
                </SelectPrimitive.ItemIndicator>
              </SelectItem>
            ))}
          </SelectPrimitive.Viewport>
        </SelectContent>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

interface FieldPickerProps {
  /** Fields to choose from. */
  fields: DatabaseField[];
  /** Called with the chosen field. */
  onSelect: (field: DatabaseField) => void;
  /** Placeholder of the search input. */
  placeholder: string;
  /** Ids shown as already chosen (greyed, still selectable). */
  selectedIds?: string[];
}

/**
 * A searchable list of fields, like Notion's "Filter by…" menu: type to narrow,
 * arrows to move, Enter to pick.
 *
 * @param props the picker props.
 * @returns the picker.
 */
export function FieldPicker({
  fields,
  onSelect,
  placeholder,
  selectedIds,
}: FieldPickerProps) {
  const [search, setSearch] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();

  const matches = React.useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term
      ? fields.filter((field) => field.name.toLocaleLowerCase().includes(term))
      : fields;
  }, [fields, search]);

  const handleSearchChange = React.useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(ev.target.value);
      setActiveIndex(0);
    },
    []
  );

  const handleKeyDown = React.useCallback(
    (ev: React.KeyboardEvent<HTMLInputElement>) => {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        const field = matches[activeIndex];
        if (field) {
          onSelect(field);
        }
      }
    },
    [matches, activeIndex, onSelect]
  );

  return (
    <div>
      <SearchInput
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={
          matches[activeIndex]
            ? `${listId}-${matches[activeIndex].id}`
            : undefined
        }
        value={search}
        placeholder={placeholder}
        onChange={handleSearchChange}
        onKeyDown={handleKeyDown}
      />
      <List id={listId} role="listbox" aria-label={placeholder}>
        {matches.map((field, index) => (
          <FieldOption
            key={field.id}
            id={`${listId}-${field.id}`}
            role="option"
            aria-selected={index === activeIndex}
            $active={index === activeIndex}
            $muted={selectedIds?.includes(field.id)}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => onSelect(field)}
          >
            <FieldKindIcon field={field} />
            <RowLabel>{field.name}</RowLabel>
          </FieldOption>
        ))}
      </List>
    </div>
  );
}

const SelectTrigger = styled(SelectPrimitive.Trigger)<{
  $borderless?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  min-width: 0;
  max-width: 100%;
  padding: 0 4px 0 8px;
  border: 1px solid
    ${(props) => (props.$borderless ? "transparent" : props.theme.inputBorder)};
  ${borderRadius(6)}
  background: ${(props) =>
    props.$borderless ? "none" : props.theme.inputBackground};
  color: ${s("text")};
  font-size: 14px;
  cursor: var(--pointer);

  &:hover:not(:disabled) {
    background: ${s("listItemHoverBackground")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: -1px;
  }

  &:disabled {
    cursor: default;
    color: ${s("textSecondary")};
  }

  &:disabled > svg:last-child {
    display: none;
  }

  svg {
    flex-shrink: 0;
    color: ${s("textTertiary")};
  }
`;

const TriggerLabel = styled.span`
  flex: 1;
  min-width: 0;
  text-align: start;
  ${ellipsis()}
`;

const SelectContent = styled(SelectPrimitive.Content)`
  z-index: ${depths.menu};
  min-width: var(--radix-select-trigger-width);
  max-width: 320px;
  max-height: min(360px, var(--radix-select-content-available-height));
  padding: 4px;
  ${borderRadius(8)}
  background: ${s("menuBackground")};
  box-shadow: ${s("menuShadow")};
  overflow: hidden;
  animation: ${fadeAndSlideDown} 150ms ease;
`;

const SelectItem = styled(SelectPrimitive.Item)`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 28px 2px 8px;
  position: relative;
  ${borderRadius(6)}
  color: ${s("text")};
  font-size: 14px;
  cursor: var(--pointer);
  user-select: none;
  outline: none;

  &[data-highlighted] {
    background: ${s("listItemHoverBackground")};
  }

  svg {
    flex-shrink: 0;
    color: ${s("textTertiary")};
  }
`;

const Indicator = styled.span`
  position: absolute;
  inset-inline-end: 6px;
  display: inline-flex;
`;

const SearchInput = styled(SmallInput)`
  width: 100%;
  margin-bottom: 6px;
`;

const List = styled.div`
  max-height: 280px;
  overflow-y: auto;
`;

const FieldOption = styled.div<{ $active: boolean; $muted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 2px 8px;
  ${borderRadius(6)}
  color: ${(props) =>
    props.$muted ? props.theme.textTertiary : props.theme.text};
  font-size: 14px;
  cursor: var(--pointer);

  ${(props) =>
    props.$active &&
    css`
      background: ${props.theme.listItemHoverBackground};
    `}

  svg {
    flex-shrink: 0;
    color: ${s("textTertiary")};
  }
`;

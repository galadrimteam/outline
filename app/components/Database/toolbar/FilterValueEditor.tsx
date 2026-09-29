import { observer } from "mobx-react";
import { CheckmarkIcon, UserIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  buildDateFilterValue,
  dateFilterModeLabel,
  dateModeNeedsDate,
  dateModeNeedsDays,
  FILTER_ME,
  getDateFilterModes,
  getFilterValueKind,
  isDateFilterValue,
} from "@shared/databases/filters";
import type {
  DatabaseDateFilterValue,
  DatabaseField,
  DatabaseFilterItem,
  DatabaseFilterValue,
  DatabaseRecord,
} from "@shared/databases/types";
import { borderRadius, s } from "@shared/styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import type Database from "~/models/Database";
import { calendarDayToISO, isoToCalendarDay } from "../cells/format";
import { useListNavigation } from "../cells/hooks";
import { getCell } from "../cells/registry";
import { CompactSelect, SmallInput } from "./components";
import type { PickerOption } from "./filterCandidates";
import { candidateKind } from "./filterCandidates";
import { useFilterOptions } from "./useFilterOptions";

interface Props {
  /** The database of the rule. */
  database: Database;
  /** The field of the rule. */
  field: DatabaseField;
  /** The rule whose value is edited. */
  item: DatabaseFilterItem;
  /** The view filtered, none for an automation's condition. */
  viewId?: string;
  /** Loaded rows, whose people and linked rows are offered at once. */
  records: DatabaseRecord[];
  /** Called with the new value. */
  onChange: (value: DatabaseFilterValue) => void;
}

/**
 * Edits the value of a filter rule with the editor its field and operator
 * need: text, number, options, people (with « Me »), linked rows, a checkbox or
 * a date mode. Nothing is drawn for "is empty" and "is not empty".
 *
 * @param props the rule, its field and the change callback.
 * @returns the value editor.
 */
export const FilterValueEditor = observer(function FilterValueEditor({
  database,
  field,
  item,
  viewId,
  records,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const kind = getFilterValueKind(field, item.operator);

  if (kind === "none") {
    return null;
  }

  if (kind === "date") {
    return (
      <DateValue
        operator={item.operator}
        value={isDateFilterValue(item.value) ? item.value : undefined}
        onChange={onChange}
      />
    );
  }

  if (field.cellValueType === "boolean") {
    return (
      <CompactSelect
        ariaLabel={t("Value")}
        value={item.value === true ? "true" : "false"}
        options={[
          { value: "true", label: t("Checked") },
          { value: "false", label: t("Unchecked") },
        ]}
        onChange={(value) => onChange(value === "true")}
      />
    );
  }

  const isTextMatch =
    item.operator === "contains" || item.operator === "doesNotContain";
  if (!isTextMatch && candidateKind(field)) {
    const multiple = kind === "list";
    return (
      <PickedValue
        database={database}
        field={field}
        viewId={viewId}
        records={records}
        selected={
          Array.isArray(item.value)
            ? item.value
            : typeof item.value === "string"
              ? [item.value]
              : []
        }
        multiple={multiple}
        onChange={(values) => onChange(multiple ? values : (values[0] ?? null))}
      />
    );
  }

  if (field.cellValueType === "number") {
    return (
      <TypedValue
        type="number"
        value={typeof item.value === "number" ? String(item.value) : ""}
        onCommit={(text) => {
          const number = Number(text.replace(",", "."));
          onChange(text.trim() === "" || Number.isNaN(number) ? null : number);
        }}
      />
    );
  }

  return (
    <TypedValue
      type="text"
      value={typeof item.value === "string" ? item.value : ""}
      onCommit={(text) => onChange(text)}
    />
  );
});

interface PickedValueProps {
  database: Database;
  field: DatabaseField;
  viewId?: string;
  records: DatabaseRecord[];
  selected: string[];
  multiple: boolean;
  onChange: (values: string[]) => void;
}

const PickedValue = observer(function PickedValue({
  database,
  field,
  viewId,
  records,
  selected,
  multiple,
  onChange,
}: PickedValueProps) {
  const [search, setSearch] = React.useState("");
  const options = useFilterOptions({
    database,
    field,
    viewId,
    records,
    search,
  });

  return (
    <OptionsValue
      database={database}
      field={field}
      options={options ?? []}
      selected={selected}
      multiple={multiple}
      search={search}
      onSearchChange={setSearch}
      onChange={onChange}
    />
  );
});

interface OptionsValueProps {
  database: Database;
  field: DatabaseField;
  options: PickerOption[];
  selected: string[];
  multiple: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  onChange: (values: string[]) => void;
}

const OptionsValue = observer(function OptionsValue({
  database,
  field,
  options,
  selected,
  multiple,
  search,
  onSearchChange,
  onChange,
}: OptionsValueProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const { Renderer } = getCell(field.type);

  // Options come and go with the search; the chosen ones stay drawn.
  const seen = React.useRef(new Map<string, PickerOption>());
  for (const option of options) {
    seen.current.set(option.value, option);
  }
  const chosen = selected.flatMap((value) => {
    const option = seen.current.get(value);
    return option ? [option] : [];
  });

  const term = search.trim().toLocaleLowerCase();
  const listed = new Set(options.map((option) => option.value));
  const matches = term
    ? options.filter((option) =>
        option.label.toLocaleLowerCase().includes(term)
      )
    : [...options, ...chosen.filter((option) => !listed.has(option.value))];

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        onSearchChange("");
      }
    },
    [onSearchChange]
  );

  const handleToggle = React.useCallback(
    (value: string) => {
      if (!multiple) {
        onChange([value]);
        setOpen(false);
        return;
      }
      onChange(
        selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value]
      );
    },
    [multiple, selected, onChange]
  );

  const { active, setActive, handleKeyDown } = useListNavigation(
    matches.length,
    (index) => {
      const option = matches[index];
      if (option) {
        handleToggle(option.value);
      }
    }
  );

  const renderOption = (option: PickerOption) =>
    option.value === FILTER_ME ? (
      <Me>
        <UserIcon size={16} />
        {option.label}
      </Me>
    ) : option.cell !== undefined ? (
      <Renderer
        field={field}
        value={option.cell}
        database={database}
        variant="card"
      />
    ) : (
      option.label
    );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        <ValueButton type="button" aria-label={t("Value")}>
          {chosen.length ? (
            <Chosen>
              {chosen.map((option) => (
                <React.Fragment key={option.value}>
                  {renderOption(option)}
                </React.Fragment>
              ))}
            </Chosen>
          ) : (
            <Placeholder>
              {multiple ? t("Select options") : t("Select an option")}
            </Placeholder>
          )}
        </ValueButton>
      </PopoverTrigger>
      <PopoverContent
        width={260}
        align="start"
        shrink
        scrollable={false}
        aria-label={t("Value")}
      >
        <Picker>
          <SmallInput
            autoFocus
            value={search}
            placeholder={t("Search")}
            onChange={(ev) => onSearchChange(ev.target.value)}
            onKeyDown={handleKeyDown}
          />
          <OptionList role="listbox" aria-multiselectable={multiple}>
            {matches.map((option, index) => {
              const isSelected = selected.includes(option.value);
              return (
                <OptionRow
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  $active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => handleToggle(option.value)}
                >
                  <OptionContent>{renderOption(option)}</OptionContent>
                  {isSelected && <CheckmarkIcon size={16} />}
                </OptionRow>
              );
            })}
            {!matches.length && <Empty>{t("No options")}</Empty>}
          </OptionList>
        </Picker>
      </PopoverContent>
    </Popover>
  );
});

interface TypedValueProps {
  type: "text" | "number";
  value: string;
  onCommit: (text: string) => void;
}

/** A text or number input committing after a pause, on Enter and on blur, so rows are not queried per keystroke. */
function TypedValue({ type, value, onCommit }: TypedValueProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState(value);
  const committed = React.useRef(value);

  React.useEffect(() => {
    setDraft(value);
    committed.current = value;
  }, [value]);

  const commit = React.useCallback(
    (text: string) => {
      if (text !== committed.current) {
        committed.current = text;
        onCommit(text);
      }
    },
    [onCommit]
  );

  React.useEffect(() => {
    const timeout = setTimeout(() => commit(draft), 400);
    return () => clearTimeout(timeout);
  }, [draft, commit]);

  return (
    <ValueInput
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      aria-label={t("Value")}
      placeholder={t("Type a value…")}
      value={draft}
      onChange={(ev) => setDraft(ev.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") {
          commit(draft);
        }
      }}
    />
  );
}

interface DateValueProps {
  operator: DatabaseFilterItem["operator"];
  value: DatabaseDateFilterValue | undefined;
  onChange: (value: DatabaseDateFilterValue) => void;
}

function DateValue({ operator, value, onChange }: DateValueProps) {
  const { t } = useTranslation();
  const timeZone =
    value?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const modes = getDateFilterModes(operator);
  const mode = value?.mode ?? modes[0];
  const day = value?.exactDate
    ? isoToCalendarDay(value.exactDate, timeZone)
    : undefined;

  return (
    <DateRow>
      <CompactSelect
        ariaLabel={t("Date")}
        value={mode}
        options={modes.map((m) => ({
          value: m,
          label: dateFilterModeLabel(m, t),
        }))}
        onChange={(next) =>
          onChange(buildDateFilterValue(next, timeZone, value))
        }
      />
      {dateModeNeedsDays(mode) && (
        <DaysInput
          type="number"
          min={0}
          step={1}
          aria-label={t("Number of days")}
          value={value?.numberOfDays ?? ""}
          onChange={(ev) => {
            const days = Math.max(0, Math.round(Number(ev.target.value)));
            onChange({
              ...buildDateFilterValue(mode, timeZone, value),
              numberOfDays: Number.isFinite(days) ? days : 0,
            });
          }}
        />
      )}
      {dateModeNeedsDate(mode) && (
        <ValueInput
          type="date"
          aria-label={t("Exact date")}
          value={day ? toInputDate(day) : ""}
          onChange={(ev) => {
            const [year, month, date] = ev.target.value.split("-").map(Number);
            if (!year || !month || !date) {
              return;
            }
            onChange({
              ...buildDateFilterValue(mode, timeZone, value),
              exactDate: calendarDayToISO(
                new Date(year, month - 1, date),
                undefined,
                timeZone
              ),
            });
          }}
        />
      )}
    </DateRow>
  );
}

function toInputDate(day: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

const ValueInput = styled(SmallInput)`
  width: 100%;
`;

const DaysInput = styled(SmallInput)`
  width: 64px;
  flex-shrink: 0;
`;

const DateRow = styled.div`
  display: flex;
  gap: 6px;
  min-width: 0;
`;

const ValueButton = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 28px;
  padding: 2px 8px;
  border: 1px solid ${s("inputBorder")};
  ${borderRadius(6)}
  background: ${s("inputBackground")};
  color: ${s("text")};
  font-size: 14px;
  text-align: start;
  cursor: var(--pointer);

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: -1px;
  }
`;

const Chosen = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
`;

const Placeholder = styled.span`
  color: ${s("placeholder")};
`;

const Picker = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 6px;
`;

const OptionList = styled.div`
  max-height: 260px;
  overflow-y: auto;
`;

const OptionRow = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 2px 8px;
  ${borderRadius(6)}
  background: ${(props) =>
    props.$active ? props.theme.listItemHoverBackground : "none"};
  cursor: var(--pointer);

  svg {
    flex-shrink: 0;
    color: ${s("textSecondary")};
  }
`;

const OptionContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const Me = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
`;

const Empty = styled.div`
  padding: 6px 8px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

import { transparentize } from "polished";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Calendar } from "@shared/components/Calendar";
import type { DatabaseCellValue } from "@shared/databases/types";
import { s } from "@shared/styles";
import { dateLocale } from "@shared/utils/date";
import ButtonSmall from "~/components/ButtonSmall";
import Flex from "~/components/Flex";
import Switch from "~/components/Switch";
import useUserLocale from "~/hooks/useUserLocale";
import { EditorPopover } from "./components/EditorPopover";
import { CellText, EmptyValue } from "./components/styles";
import { isWritable } from "./editable";
import {
  calendarDayToISO,
  cellValueToText,
  dateFormatting,
  datePartsInZone,
  fieldTimeZone,
  formatDateValue,
  hasTime,
  isoToCalendarDay,
} from "./format";
import { useCellLocale } from "./hooks";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** Dates, and date ranges when the field names its end field (`meta.endFieldId`). */
export const dateCell: CellDefinition = {
  Renderer: DateRenderer,
  Editor: DateEditor,
  isEditable: isWritable,
  opensOnTyping: true,
};

function DateRenderer({
  field,
  value,
  variant,
  wrap,
  record,
}: CellRendererProps) {
  const { t } = useTranslation();
  const locale = useCellLocale();
  const start = cellValueToText(field, value, locale);
  const endFieldId = field.meta?.endFieldId;
  const endValue = endFieldId ? record?.fields[endFieldId] : undefined;
  const end =
    typeof endValue === "string"
      ? formatDateValue(endValue, dateFormatting(field), locale)
      : "";

  if (!start) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  return (
    <CellText $variant={variant} $wrap={wrap}>
      {end ? `${start} → ${end}` : start}
    </CellText>
  );
}

interface Time {
  hour: number;
  minute: number;
}

function DateEditor(props: CellEditorProps) {
  const { field, value, record, onChange, onChangeFields, onClose } = props;
  const { t } = useTranslation();
  const language = useUserLocale();
  const locale = useCellLocale();
  const timeZone = fieldTimeZone(field);
  const formatting = dateFormatting(field);
  const withTime = hasTime(formatting);
  const endFieldId = onChangeFields ? field.meta?.endFieldId : undefined;
  const endValue = endFieldId ? record?.fields[endFieldId] : undefined;

  const [start, setStart] = React.useState(() => readDay(value, timeZone));
  const [end, setEnd] = React.useState(() => readDay(endValue, timeZone));
  const [startTime, setStartTime] = React.useState(() =>
    readTime(value, timeZone)
  );
  const [endTime, setEndTime] = React.useState(() =>
    readTime(endValue, timeZone)
  );
  const [isRange, setIsRange] = React.useState(() => !!end);

  const write = React.useCallback(
    (next: {
      start?: Date;
      end?: Date;
      startTime?: Time;
      endTime?: Time;
      isRange: boolean;
    }) => {
      const startIso = next.start
        ? calendarDayToISO(next.start, next.startTime, timeZone)
        : null;
      if (!endFieldId || !onChangeFields) {
        onChange(startIso);
        return;
      }
      const endIso =
        next.isRange && next.end
          ? calendarDayToISO(next.end, next.endTime, timeZone)
          : null;
      onChangeFields({ [field.id]: startIso, [endFieldId]: endIso });
    },
    [endFieldId, field.id, onChange, onChangeFields, timeZone]
  );

  const handleSelectDay = React.useCallback(
    (day: Date | undefined) => {
      setStart(day);
      write({ start: day, startTime, isRange: false });
    },
    [startTime, write]
  );

  const handleSelectRange = React.useCallback(
    (range: DateRange | undefined) => {
      setStart(range?.from);
      setEnd(range?.to);
      write({
        start: range?.from,
        end: range?.to ?? range?.from,
        startTime,
        endTime,
        isRange: true,
      });
    },
    [endTime, startTime, write]
  );

  const handleToggleRange = React.useCallback(
    (checked: boolean) => {
      setIsRange(checked);
      const nextEnd = checked ? (end ?? start) : undefined;
      setEnd(nextEnd);
      write({ start, end: nextEnd, startTime, endTime, isRange: checked });
    },
    [end, endTime, start, startTime, write]
  );

  const handleStartTime = React.useCallback(
    (time: Time) => {
      setStartTime(time);
      write({ start, end, startTime: time, endTime, isRange });
    },
    [end, endTime, isRange, start, write]
  );

  const handleEndTime = React.useCallback(
    (time: Time) => {
      setEndTime(time);
      write({ start, end, startTime, endTime: time, isRange });
    },
    [end, isRange, start, startTime, write]
  );

  const handleClear = React.useCallback(() => {
    setStart(undefined);
    setEnd(undefined);
    write({ isRange: false });
    onClose();
  }, [onClose, write]);

  const describe = (day: Date | undefined, time: Time | undefined) =>
    day
      ? formatDateValue(
          calendarDayToISO(day, time, timeZone),
          formatting,
          locale
        )
      : "";

  return (
    <EditorPopover
      anchor={<DateRenderer {...props} />}
      label={t("Edit date")}
      onClose={onClose}
      width={290}
    >
      <Summary column gap={4}>
        <Flex align="center" gap={6}>
          <SummaryValue>
            {describe(start, startTime) || t("No date")}
          </SummaryValue>
          {withTime && start && (
            <TimeInput time={startTime} onChange={handleStartTime} />
          )}
        </Flex>
        {isRange && (
          <Flex align="center" gap={6}>
            <SummaryValue>
              {describe(end, endTime) || t("No end date")}
            </SummaryValue>
            {withTime && end && (
              <TimeInput time={endTime} onChange={handleEndTime} />
            )}
          </Flex>
        )}
      </Summary>
      <CalendarWrapper>
        {isRange ? (
          <Calendar
            mode="range"
            selected={{ from: start, to: end }}
            onSelect={handleSelectRange}
            defaultMonth={start}
            locale={dateLocale(language)}
          />
        ) : (
          <Calendar
            mode="single"
            required
            selected={start}
            onSelect={handleSelectDay}
            defaultMonth={start}
            locale={dateLocale(language)}
          />
        )}
      </CalendarWrapper>
      <Footer align="center" justify="space-between">
        {endFieldId ? (
          <Switch
            label={t("End date")}
            checked={isRange}
            onChange={handleToggleRange}
            inForm={false}
          />
        ) : (
          <span />
        )}
        <ButtonSmall neutral onClick={handleClear}>
          {t("Clear")}
        </ButtonSmall>
      </Footer>
    </EditorPopover>
  );
}

function TimeInput({
  time,
  onChange,
}: {
  time: Time | undefined;
  onChange: (time: Time) => void;
}) {
  const { t } = useTranslation();
  const pad = (n: number) => String(n).padStart(2, "0");
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [hour, minute] = event.target.value.split(":").map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      onChange({ hour, minute });
    }
  };

  return (
    <TimeField
      type="time"
      aria-label={t("Time")}
      value={time ? `${pad(time.hour)}:${pad(time.minute)}` : "00:00"}
      onChange={handleChange}
    />
  );
}

function readDay(
  value: DatabaseCellValue | undefined,
  timeZone?: string
): Date | undefined {
  return typeof value === "string"
    ? isoToCalendarDay(value, timeZone)
    : undefined;
}

function readTime(
  value: DatabaseCellValue | undefined,
  timeZone?: string
): Time | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const parts = datePartsInZone(date, timeZone);
  return { hour: parts.hour, minute: parts.minute };
}

const Summary = styled(Flex)`
  padding: 10px 12px;
  border-bottom: 1px solid ${s("divider")};
`;

const SummaryValue = styled.span`
  flex: 1;
  font-size: 14px;
  color: ${s("text")};
`;

const TimeField = styled.input`
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  padding: 2px 4px;
  font: inherit;
  font-size: 13px;
  color: ${s("text")};
  background: ${s("background")};
`;

const CalendarWrapper = styled.div`
  .rdp-day_range_middle,
  .rdp-day_range_middle:hover {
    border-radius: 0;
    color: ${s("text")};
    background: ${(props) => transparentize(0.85, props.theme.accent)};
  }
`;

const Footer = styled(Flex)`
  padding: 8px 12px;
  border-top: 1px solid ${s("divider")};
`;

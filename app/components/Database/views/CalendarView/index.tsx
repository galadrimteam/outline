import type {
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  format,
  isSameMonth,
  isToday,
  isWeekend,
} from "date-fns";
import { observer } from "mobx-react";
import { BackIcon, NextIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css, useTheme } from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseFilter,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import { borderRadius, ellipsis, s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import Tooltip from "~/components/Tooltip";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import {
  calendarDayToISO,
  dateFormatting,
  datePartsInZone,
  fieldTimeZone,
  hasTime,
} from "../../cells/format";
import { getCell } from "../../cells/registry";
import { defaultDateField } from "../../newViewDefaults";
import type { DatabaseViewProps } from "../../types";
import {
  CardProperties,
  openableProps,
  recordColor,
  RecordTitle,
  visibleCardFields,
} from "../GalleryView/cards";
import type { CalendarItem, CalendarMode, WeekSegment } from "./calendarModel";
import {
  dayKey,
  layoutWeek,
  rangeFilter,
  recordSpan,
  shiftDate,
  visibleDays,
  weeksOf,
} from "./calendarModel";
import { useDateLocale } from "./useDateLocale";

/** Rows loaded at most for one calendar page, in pages of 200. */
const MAX_ROWS = 2000;

/**
 * Notion-like calendar: a month or a week starting on Monday, rows placed on
 * their date (spanning to their end date when the view has one), today
 * circled. Dragging a card to another day moves its dates; the « + » of a day
 * creates a row on that day.
 *
 * @param props the database, the view, its rows and the callbacks.
 * @returns the calendar.
 */
export const CalendarView = observer(function CalendarView({
  database,
  view,
  query,
  readOnly,
  onOpenRecord,
  onCreateRecord,
}: DatabaseViewProps) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const locale = useDateLocale();
  const [mode, setMode] = useCalendarMode(view.id);
  const [anchor, setAnchor] = React.useState(() => new Date());
  const startField = calendarStartField(database, view);
  const endField = calendarEndField(database, view, startField);
  const days = React.useMemo(() => visibleDays(anchor, mode), [anchor, mode]);
  const weeks = React.useMemo(() => weeksOf(days), [days]);

  const rangeQuery = startField
    ? databaseRecords.query(database.id, view.id, {
        ...query.params,
        extraFilter: andFilters(
          query.params.extraFilter,
          rangeFilter(startField, endField, days[0], days[days.length - 1])
        ),
        pageSize: 200,
      })
    : query;

  React.useEffect(() => {
    void rangeQuery.fetch();
  }, [rangeQuery]);

  React.useEffect(() => {
    if (
      rangeQuery.hasMore &&
      !rangeQuery.isLoading &&
      rangeQuery.records.length < MAX_ROWS
    ) {
      void rangeQuery.loadMore();
    }
  }, [
    rangeQuery,
    rangeQuery.hasMore,
    rangeQuery.isLoading,
    rangeQuery.records.length,
  ]);

  const items = React.useMemo(() => {
    if (!startField) {
      return [];
    }
    const placed: CalendarItem[] = [];
    for (const record of rangeQuery.records) {
      const span = recordSpan(record, startField, endField);
      if (span) {
        placed.push({ record, ...span });
      }
    }
    return placed;
  }, [rangeQuery.records, startField, endField]);

  const canMove =
    !readOnly &&
    !!startField &&
    getCell(startField.type).isEditable(startField) &&
    (!endField || getCell(endField.type).isEditable(endField));
  const canCreate = !readOnly && !!onCreateRecord && canMove;

  const handleMove = React.useCallback(
    async (record: DatabaseRecord, days: number) => {
      if (!startField || !days) {
        return;
      }
      const fields: Record<string, DatabaseCellInput> = {};
      const startValue = record.fields[startField.id];
      if (typeof startValue === "string") {
        fields[startField.id] = shiftDate(
          startValue,
          days,
          fieldTimeZone(startField)
        );
      }
      const endValue = endField ? record.fields[endField.id] : undefined;
      if (endField && typeof endValue === "string") {
        fields[endField.id] = shiftDate(
          endValue,
          days,
          fieldTimeZone(endField)
        );
      }
      try {
        await databaseRecords.update(database.id, record.id, fields);
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t("The date could not be changed")
        );
      }
    },
    [databaseRecords, database.id, startField, endField, t]
  );

  const handleCreate = React.useCallback(
    (day: Date) => {
      if (!startField || !onCreateRecord) {
        return;
      }
      void onCreateRecord({
        [startField.id]: calendarDayToISO(
          day,
          undefined,
          fieldTimeZone(startField)
        ),
      });
    },
    [startField, onCreateRecord]
  );

  const handlePrevious = React.useCallback(
    () =>
      setAnchor((date) =>
        mode === "month" ? addMonths(date, -1) : addWeeks(date, -1)
      ),
    [mode]
  );
  const handleNext = React.useCallback(
    () =>
      setAnchor((date) =>
        mode === "month" ? addMonths(date, 1) : addWeeks(date, 1)
      ),
    [mode]
  );
  const handleToday = React.useCallback(() => setAnchor(new Date()), []);

  if (!startField) {
    return (
      <Empty>
        {t("Choose the date property of this calendar in the view options.")}
      </Empty>
    );
  }

  const title =
    mode === "month"
      ? capitalize(format(anchor, "LLLL yyyy", { locale }))
      : `${format(days[0], "d MMM", { locale })} – ${format(
          days[days.length - 1],
          "d MMM yyyy",
          { locale }
        )}`;

  return (
    <Wrapper aria-busy={rangeQuery.isLoading}>
      <Header>
        <Title aria-live="polite">{title}</Title>
        <HeaderActions>
          <Segmented role="radiogroup" aria-label={t("Show calendar as")}>
            <SegmentButton
              type="button"
              role="radio"
              aria-checked={mode === "month"}
              $active={mode === "month"}
              onClick={() => setMode("month")}
            >
              {t("Month")}
            </SegmentButton>
            <SegmentButton
              type="button"
              role="radio"
              aria-checked={mode === "week"}
              $active={mode === "week"}
              onClick={() => setMode("week")}
            >
              {t("Week")}
            </SegmentButton>
          </Segmented>
          <Tooltip
            content={
              mode === "month" ? t("Previous month") : t("Previous week")
            }
          >
            <NavButton
              type="button"
              aria-label={
                mode === "month" ? t("Previous month") : t("Previous week")
              }
              onClick={handlePrevious}
            >
              <BackIcon size={18} />
            </NavButton>
          </Tooltip>
          <TodayButton type="button" onClick={handleToday}>
            {t("Today")}
          </TodayButton>
          <Tooltip
            content={mode === "month" ? t("Next month") : t("Next week")}
          >
            <NavButton
              type="button"
              aria-label={mode === "month" ? t("Next month") : t("Next week")}
              onClick={handleNext}
            >
              <NextIcon size={18} />
            </NavButton>
          </Tooltip>
        </HeaderActions>
      </Header>
      <CalendarGrid
        database={database}
        view={view}
        weeks={weeks}
        anchor={anchor}
        mode={mode}
        items={items}
        startField={startField}
        canMove={canMove}
        canCreate={canCreate}
        onMove={handleMove}
        onCreate={handleCreate}
        onOpen={onOpenRecord}
      />
    </Wrapper>
  );
});

interface GridProps {
  database: Database;
  view: DatabaseView;
  weeks: Date[][];
  anchor: Date;
  mode: CalendarMode;
  items: CalendarItem[];
  startField: DatabaseField;
  canMove: boolean;
  canCreate: boolean;
  onMove: (record: DatabaseRecord, days: number) => void;
  onCreate: (day: Date) => void;
  onOpen: (recordId: string) => void;
}

const CalendarGrid = observer(function CalendarGrid({
  database,
  view,
  weeks,
  anchor,
  mode,
  items,
  startField,
  canMove,
  canCreate,
  onMove,
  onCreate,
  onOpen,
}: GridProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const fields = visibleCardFields(database, view);
  const [dragging, setDragging] = React.useState<DragState>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    })
  );

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (!isDragData(data)) {
      return;
    }
    const pointed = dayUnderPointer(event.activatorEvent);
    setDragging({ ...data, grabbedDay: pointed ?? data.grabbedDay });
  }, []);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const state = dragging;
      setDragging(undefined);
      if (!state || !event.over) {
        return;
      }
      const target = parseDayKey(String(event.over.id));
      const grabbed = parseDayKey(state.grabbedDay);
      if (!target || !grabbed) {
        return;
      }
      onMove(state.record, differenceInCalendarDays(target, grabbed));
    },
    [dragging, onMove]
  );

  const weekdays = weeks[0] ?? [];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(undefined)}
      accessibility={{
        screenReaderInstructions: {
          draggable: t(
            "Press Space to pick up the card, arrows to move it to another day, Space to drop it, Escape to cancel."
          ),
        },
      }}
    >
      <Table role="grid" aria-label={t("Calendar")}>
        <Weekdays role="row">
          {weekdays.map((day) => (
            <Weekday key={day.getDay()} role="columnheader">
              {format(day, mode === "week" ? "EEE d" : "EEE", { locale })}
            </Weekday>
          ))}
        </Weekdays>
        {weeks.map((week) => (
          <WeekRow
            key={dayKey(week[0])}
            database={database}
            view={view}
            week={week}
            anchor={anchor}
            mode={mode}
            items={items}
            fields={fields}
            startField={startField}
            canMove={canMove}
            canCreate={canCreate}
            onCreate={onCreate}
            onOpen={onOpen}
          />
        ))}
      </Table>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <Card $color={undefined} $dragging>
            <CardTitle>
              <RecordTitle database={database} record={dragging.record} />
            </CardTitle>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
});

interface WeekRowProps {
  database: Database;
  view: DatabaseView;
  week: Date[];
  anchor: Date;
  mode: CalendarMode;
  items: CalendarItem[];
  fields: DatabaseField[];
  startField: DatabaseField;
  canMove: boolean;
  canCreate: boolean;
  onCreate: (day: Date) => void;
  onOpen: (recordId: string) => void;
}

const WeekRow = observer(function WeekRow({
  database,
  view,
  week,
  anchor,
  mode,
  items,
  fields,
  startField,
  canMove,
  canCreate,
  onCreate,
  onOpen,
}: WeekRowProps) {
  const { segments, lanes } = layoutWeek(week, items);

  return (
    <Week
      role="row"
      $mode={mode}
      style={{
        gridTemplateRows: `28px repeat(${lanes}, auto) minmax(12px, 1fr)`,
      }}
    >
      {week.map((day, column) => (
        <DayCell
          key={dayKey(day)}
          day={day}
          column={column}
          outside={mode === "month" && !isSameMonth(day, anchor)}
          canCreate={canCreate}
          onCreate={onCreate}
        />
      ))}
      {segments.map((segment) => (
        <CalendarCard
          key={`${segment.item.record.id}:${segment.column}`}
          database={database}
          view={view}
          segment={segment}
          week={week}
          fields={fields}
          startField={startField}
          canMove={canMove}
          onOpen={onOpen}
        />
      ))}
    </Week>
  );
});

interface DayCellProps {
  day: Date;
  column: number;
  outside: boolean;
  canCreate: boolean;
  onCreate: (day: Date) => void;
}

const DayCell = React.memo(function DayCell({
  day,
  column,
  outside,
  canCreate,
  onCreate,
}: DayCellProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const key = dayKey(day);
  const { setNodeRef, isOver } = useDroppable({ id: key });
  const today = isToday(day);
  const label = format(day, "EEEE d MMMM yyyy", { locale });

  return (
    <Day
      ref={setNodeRef}
      role="gridcell"
      aria-label={label}
      data-day={key}
      $outside={outside}
      $weekend={isWeekend(day)}
      $over={isOver}
      style={{ gridColumn: column + 1 }}
    >
      <DayHeader>
        {canCreate && (
          <Tooltip content={t("New page on {{ date }}", { date: label })}>
            <AddButton
              type="button"
              aria-label={t("New page on {{ date }}", { date: label })}
              onClick={() => onCreate(day)}
            >
              <PlusIcon size={16} />
            </AddButton>
          </Tooltip>
        )}
        <DayNumber $today={today} aria-current={today ? "date" : undefined}>
          {day.getDate() === 1 && !today
            ? format(day, "d MMM", { locale })
            : day.getDate()}
        </DayNumber>
      </DayHeader>
    </Day>
  );
});

interface CardProps {
  database: Database;
  view: DatabaseView;
  segment: WeekSegment;
  week: Date[];
  fields: DatabaseField[];
  startField: DatabaseField;
  canMove: boolean;
  onOpen: (recordId: string) => void;
}

const CalendarCard = observer(function CalendarCard({
  database,
  view,
  segment,
  week,
  fields,
  startField,
  canMove,
  onOpen,
}: CardProps) {
  const theme = useTheme();
  const { record } = segment.item;
  const data: DragData = {
    record,
    grabbedDay: dayKey(week[segment.column]),
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${record.id}:${dayKey(week[0])}`,
    data,
    disabled: !canMove,
  });
  const color = recordColor(database, view, record, theme);
  const open = openableProps(() => onOpen(record.id), { withSpace: !canMove });
  const time = startTime(record, startField, segment);

  return (
    <Card
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...open}
      onKeyDown={(ev) => {
        listeners?.onKeyDown?.(ev);
        open.onKeyDown(ev);
      }}
      aria-roledescription={canMove ? "draggable" : undefined}
      $color={color}
      $dragging={isDragging}
      $continuesBefore={segment.continuesBefore}
      $continuesAfter={segment.continuesAfter}
      style={{
        gridColumn: `${segment.column + 1} / span ${segment.span}`,
        gridRow: segment.lane + 2,
      }}
    >
      <CardTitle>
        {time && <Time>{time}</Time>}
        <RecordTitle database={database} record={record} />
      </CardTitle>
      <CardProperties database={database} record={record} fields={fields} />
    </Card>
  );
});

interface DragData {
  record: DatabaseRecord;
  /** The day the card was picked up on, "yyyy-MM-dd". */
  grabbedDay: string;
}

type DragState = DragData;

function isDragData(value: unknown): value is DragData {
  return (
    typeof value === "object" &&
    value !== null &&
    "record" in value &&
    "grabbedDay" in value
  );
}

const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

function dayUnderPointer(event: Event): string | undefined {
  if (!("clientX" in event) || !("clientY" in event)) {
    return undefined;
  }
  const { clientX, clientY } = event;
  if (typeof clientX !== "number" || typeof clientY !== "number") {
    return undefined;
  }
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (element instanceof HTMLElement && element.dataset.day) {
      return element.dataset.day;
    }
  }
  return undefined;
}

function parseDayKey(key: string): Date | undefined {
  const [year, month, day] = key.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : undefined;
}

function andFilters(
  a: DatabaseFilter | null | undefined,
  b: DatabaseFilter
): DatabaseFilter {
  return a ? { conjunction: "and", filterSet: [a, b] } : b;
}

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/**
 * The start date property of a calendar: the view's, else the first date
 * property of the database.
 *
 * @param database the database.
 * @param view the calendar view.
 * @returns the field, or undefined when the database has no date.
 */
function calendarStartField(
  database: Database,
  view: DatabaseView
): DatabaseField | undefined {
  const chosen = view.options.startDateFieldId
    ? database.fieldById(view.options.startDateFieldId)
    : undefined;
  return chosen ?? defaultDateField(database.fields ?? []);
}

/**
 * The end date property of a calendar: the view's, else the end paired with
 * the start property (a Notion date range). An empty id means « None ».
 *
 * @param database the database.
 * @param view the calendar view.
 * @param startField the start property.
 * @returns the field, or undefined for single-day rows.
 */
function calendarEndField(
  database: Database,
  view: DatabaseView,
  startField: DatabaseField | undefined
): DatabaseField | undefined {
  const id = view.options.endDateFieldId ?? startField?.meta?.endFieldId;
  const field = id ? database.fieldById(id) : undefined;
  return field && field.id !== startField?.id ? field : undefined;
}

function startTime(
  record: DatabaseRecord,
  field: DatabaseField,
  segment: WeekSegment
): string | undefined {
  const value = record.fields[field.id];
  if (
    segment.continuesBefore ||
    typeof value !== "string" ||
    !hasTime(dateFormatting(field))
  ) {
    return undefined;
  }
  const parts = datePartsInZone(new Date(value), fieldTimeZone(field));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * The calendar mode chosen by the reader for a view, kept in local storage.
 *
 * @param viewId the view id.
 * @returns the mode and its setter.
 */
function useCalendarMode(
  viewId: string
): [CalendarMode, (mode: CalendarMode) => void] {
  const key = `database:${viewId}:calendarMode`;
  const [mode, setMode] = React.useState<CalendarMode>(() => {
    try {
      return window.localStorage.getItem(key) === "week" ? "week" : "month";
    } catch {
      return "month";
    }
  });
  const update = React.useCallback(
    (next: CalendarMode) => {
      setMode(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Private browsing: the mode only lasts for this page.
      }
    },
    [key]
  );
  return [mode, update];
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0 16px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${s("text")};
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Segmented = styled.div`
  display: inline-flex;
  padding: 2px;
  margin-inline-end: 8px;
  ${borderRadius(6)}
  background: ${s("backgroundSecondary")};
`;

const SegmentButton = styled.button<{ $active: boolean }>`
  height: 24px;
  padding: 0 10px;
  border: 0;
  ${borderRadius(4)}
  background: ${(props) => (props.$active ? props.theme.background : "none")};
  box-shadow: ${(props) =>
    props.$active ? "rgba(15, 15, 15, 0.1) 0 1px 2px" : "none"};
  color: ${(props) =>
    props.$active ? props.theme.text : props.theme.textSecondary};
  font-size: 13px;
  cursor: var(--pointer);

  &:focus-visible {
    outline: 2px solid ${s("accent")};
  }
`;

const NavButton = styled(NudeButton)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: ${s("textSecondary")};

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const TodayButton = styled.button`
  height: 28px;
  padding: 0 8px;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${s("textSecondary")};
  font-size: 14px;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
    outline: none;
  }
`;

const Table = styled.div`
  border: 1px solid ${s("divider")};
  ${borderRadius(8)}
  overflow: hidden;
`;

const Weekdays = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid ${s("divider")};
`;

const Weekday = styled.div`
  padding: 6px 8px;
  color: ${s("textTertiary")};
  font-size: 12px;
  text-align: end;
  text-transform: capitalize;
`;

const Week = styled.div<{ $mode: CalendarMode }>`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  row-gap: 2px;
  min-height: ${(props) => (props.$mode === "week" ? 480 : 120)}px;
  padding-bottom: 6px;
  border-bottom: 1px solid ${s("divider")};

  &:last-child {
    border-bottom: 0;
  }
`;

const Day = styled.div<{
  $outside: boolean;
  $weekend: boolean;
  $over: boolean;
}>`
  grid-row: 1 / -1;
  min-width: 0;
  border-inline-end: 1px solid ${s("divider")};
  background: ${(props) =>
    props.$over
      ? props.theme.listItemHoverBackground
      : props.$outside || props.$weekend
        ? props.theme.backgroundSecondary
        : "transparent"};
  color: ${(props) =>
    props.$outside ? props.theme.textTertiary : props.theme.textSecondary};

  &:nth-child(7) {
    border-inline-end: 0;
  }
`;

const DayHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  height: 28px;
  padding: 0 6px;
`;

const AddButton = styled(NudeButton)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-inline-end: auto;
  color: ${s("textTertiary")};
  opacity: 0;

  ${Day}:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const DayNumber = styled.span<{ $today: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border-radius: 11px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;

  ${(props) =>
    props.$today &&
    css`
      background: ${props.theme.brand.red};
      color: ${props.theme.white};
      font-weight: 600;
    `}
`;

const Card = styled.div<{
  $color: string | undefined;
  $dragging: boolean;
  $continuesBefore?: boolean;
  $continuesAfter?: boolean;
}>`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin: 0 4px;
  padding: 3px 6px;
  ${borderRadius(4)}
  background: ${(props) => props.$color ?? props.theme.background};
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "rgba(255, 255, 255, 0.094) 0 0 0 1px"
      : "rgba(15, 15, 15, 0.1) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 2px 4px"};
  font-size: 13px;
  cursor: var(--pointer);
  opacity: ${(props) => (props.$dragging ? 0.4 : 1)};
  touch-action: none;

  ${(props) =>
    props.$continuesBefore &&
    css`
      margin-inline-start: 0;
      border-start-start-radius: 0;
      border-end-start-radius: 0;
    `}

  ${(props) =>
    props.$continuesAfter &&
    css`
      margin-inline-end: 0;
      border-start-end-radius: 0;
      border-end-end-radius: 0;
    `}

  &:hover {
    filter: brightness(0.97);
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: 1px;
  }
`;

const CardTitle = styled.div`
  font-weight: 500;
  color: ${s("text")};
  ${ellipsis()}
`;

const Time = styled.span`
  margin-inline-end: 4px;
  color: ${s("textTertiary")};
  font-variant-numeric: tabular-nums;
`;

const Empty = styled.p`
  margin: 16px 0;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

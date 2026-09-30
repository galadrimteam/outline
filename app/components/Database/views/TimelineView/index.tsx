import { addDays, differenceInCalendarDays, format } from "date-fns";
import { observer } from "mobx-react";
import {
  BackIcon,
  CollapsedIcon,
  NextIcon,
  PlusIcon,
  TableIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css, useTheme } from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseRecord,
  DatabaseTimelineZoom,
  DatabaseView,
} from "@shared/databases/types";
import { borderRadius, ellipsis, s } from "@shared/styles";
import { Popover, PopoverTrigger } from "~/components/primitives/Popover";
import Tooltip from "~/components/Tooltip";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { isLinkItem, toArray } from "../../cells/format";
import { getCell } from "../../cells/registry";
import { MenuItem, MenuLabel, MenuPanel } from "../../fields/components";
import { CompactSelect } from "../../toolbar/components";
import type { RecordGroup } from "../../toolbar/grouping";
import { groupRecords, viewGroupLayout } from "../../toolbar/grouping";
import { useViewUpdate } from "../../toolbar/useViewUpdate";
import type { DatabaseViewProps } from "../../types";
import type { DaySpan } from "../CalendarView/calendarModel";
import { defaultDateField } from "../../newViewDefaults";
import { recordSpan } from "../CalendarView/calendarModel";
import { useDateLocale } from "../CalendarView/useDateLocale";
import { GroupLabel } from "../GroupLabel";
import {
  openableProps,
  recordColor,
  RecordTitle,
  recordTitle,
  visibleCardFields,
} from "../GalleryView/cards";
import type { BarDragMode, BarGeometry } from "./timelineModel";
import {
  barGeometry,
  dayToX,
  dependencyPath,
  dragSpan,
  PX_PER_DAY,
  STEP_DAYS,
  showsTimelineTable,
  spanFields,
  timelineRange,
  timelineScale,
  xToDay,
} from "./timelineModel";

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 52;
const TITLE_WIDTH = 260;
const COLUMN_WIDTH = 140;
const MAX_ROWS = 2000;
/** Days a row gets when dated from the timeline, per zoom. */
const NEW_SPAN_DAYS: Record<DatabaseTimelineZoom, number> = {
  week: 1,
  month: 1,
  quarter: 7,
  year: 30,
};

type TimelineRow =
  | { type: "group"; key: string; group: RecordGroup }
  | { type: "record"; key: string; record: DatabaseRecord };

/**
 * Notion-like timeline: one bar per row from its start to its end date, on a
 * week, month, quarter or year scale, with the rows' table on the left
 * (folded unless the view shows it), today marked in the header, previous and
 * next buttons, grouping (by a relation too) and dependency arrows when the
 * view names a self relation. Bars are dragged to move and stretched by their
 * edges to change dates; rows without a date wait under « No date ».
 *
 * @param props the database, the view, its rows and the callbacks.
 * @returns the timeline.
 */
export const TimelineView = observer(function TimelineView({
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
  const theme = useTheme();
  const update = useViewUpdate(database.id, view);
  const canConfigure = !readOnly && !view.isLocked;
  const settings = React.useMemo(
    () => view.overrides.timeline ?? {},
    [view.overrides.timeline]
  );
  const [zoom, setZoom] = React.useState<DatabaseTimelineZoom>(
    settings.zoom ?? "month"
  );
  const [showTable, setShowTable] = React.useState(
    showsTimelineTable(settings)
  );
  const [focus, setFocus] = React.useState<{ day: Date; request: number }>();
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [preview, setPreview] = React.useState<{ id: string; span: DaySpan }>();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const markerId = `timeline-arrow-${React.useId().replace(/:/g, "")}`;

  React.useEffect(() => {
    if (settings.zoom) {
      setZoom(settings.zoom);
    }
  }, [settings.zoom]);
  React.useEffect(() => {
    setShowTable(showsTimelineTable(settings));
  }, [settings]);

  const startField = timelineStartField(database, view);
  const endField = timelineEndField(database, view, startField);
  const dependencyField = settings.dependencyFieldId
    ? database.fieldById(settings.dependencyFieldId)
    : undefined;
  const canEdit =
    !readOnly &&
    !!startField &&
    getCell(startField.type).isEditable(startField) &&
    (!endField || getCell(endField.type).isEditable(endField));
  const px = PX_PER_DAY[zoom];
  const tableFields = visibleCardFields(database, view).slice(0, 2);
  const tableWidth = showTable
    ? TITLE_WIDTH + tableFields.length * COLUMN_WIDTH
    : 0;

  React.useEffect(() => {
    void query.fetch();
  }, [query]);

  React.useEffect(() => {
    if (query.hasMore && !query.isLoading && query.records.length < MAX_ROWS) {
      void query.loadMore();
    }
  }, [query, query.hasMore, query.isLoading, query.records.length]);

  const spans = React.useMemo(() => {
    const map = new Map<string, DaySpan>();
    if (!startField) {
      return map;
    }
    for (const record of query.records) {
      const span = recordSpan(record, startField, endField);
      if (span) {
        map.set(record.id, span);
      }
    }
    return map;
  }, [query.records, startField, endField]);

  const today = React.useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const range = React.useMemo(
    () =>
      timelineRange(
        Array.from(spans.values()),
        today,
        zoom,
        focus ? [focus.day] : []
      ),
    [spans, today, zoom, focus]
  );
  const scale = React.useMemo(
    () => timelineScale(range.start, range.days, zoom, locale),
    [range, zoom, locale]
  );
  const timelineWidth = range.days * px;
  const todayX = dayToX(today, range.start, px);

  const groupLevel = view.group?.[0];
  const groupField = groupLevel
    ? database.fieldById(groupLevel.fieldId)
    : undefined;
  const undated = React.useMemo(
    () => query.records.filter((record) => !spans.has(record.id)),
    [query.records, spans]
  );
  const rows = React.useMemo<TimelineRow[]>(() => {
    const dated = (record: DatabaseRecord) => spans.has(record.id);
    if (!groupField) {
      return query.records.filter(dated).map((record) => ({
        type: "record",
        key: record.id,
        record,
      }));
    }
    return groupRecords(
      query.records,
      groupField,
      groupLevel?.order,
      viewGroupLayout(view.overrides)
    ).flatMap((group): TimelineRow[] => [
      { type: "group", key: `group:${group.key}`, group },
      ...(collapsed.has(group.key)
        ? []
        : group.records.filter(dated).map((record) => ({
            type: "record" as const,
            key: `${group.key}:${record.id}`,
            record,
          }))),
    ]);
  }, [
    query.records,
    spans,
    groupField,
    groupLevel?.order,
    view.overrides,
    collapsed,
  ]);

  const visibleWidth = React.useCallback(
    (scroller: HTMLDivElement) => scroller.clientWidth - tableWidth,
    [tableWidth]
  );

  const centerOn = React.useCallback(
    (day: Date) => {
      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }
      scroller.scrollLeft = Math.max(
        0,
        dayToX(day, range.start, px) + px / 2 - visibleWidth(scroller) / 2
      );
    },
    [range.start, px, visibleWidth]
  );

  const scrollToToday = React.useCallback(
    () =>
      setFocus((current) => ({
        day: today,
        request: (current?.request ?? 0) + 1,
      })),
    [today]
  );

  const handleStep = React.useCallback(
    (direction: 1 | -1) => {
      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }
      const center = xToDay(
        scroller.scrollLeft + visibleWidth(scroller) / 2,
        range.start,
        px
      );
      setFocus((current) => ({
        day: addDays(center, direction * STEP_DAYS[zoom]),
        request: (current?.request ?? 0) + 1,
      }));
    },
    [range.start, px, visibleWidth, zoom]
  );

  const centered = React.useRef<number>();
  React.useLayoutEffect(() => {
    if (focus && centered.current !== focus.request) {
      centered.current = focus.request;
      centerOn(focus.day);
    }
  }, [focus, centerOn]);

  const scrolledOnce = React.useRef(false);

  // When a bar moves before the first day, the timeline grows to the left:
  // the scroll follows so that what is on screen stays put.
  const previousStart = React.useRef(range.start);
  React.useLayoutEffect(() => {
    const shift = differenceInCalendarDays(previousStart.current, range.start);
    previousStart.current = range.start;
    if (shift && scrolledOnce.current && scrollerRef.current) {
      scrollerRef.current.scrollLeft += shift * px;
    }
  }, [range.start, px]);

  const handleZoom = React.useCallback(
    (next: DatabaseTimelineZoom) => {
      setZoom(next);
      scrolledOnce.current = false;
      if (canConfigure) {
        void update({ overrides: { timeline: { ...settings, zoom: next } } });
      }
    },
    [canConfigure, update, settings]
  );

  React.useLayoutEffect(() => {
    if (!scrolledOnce.current && query.isLoaded) {
      scrolledOnce.current = true;
      scrollToToday();
    }
  }, [zoom, query.isLoaded, scrollToToday]);

  const handleToggleTable = React.useCallback(() => {
    const next = !showTable;
    setShowTable(next);
    if (canConfigure) {
      void update({
        overrides: { timeline: { ...settings, showTable: next } },
      });
    }
  }, [showTable, canConfigure, update, settings]);

  const handleCommit = React.useCallback(
    async (record: DatabaseRecord, after: DaySpan) => {
      if (!startField) {
        return;
      }
      const fields = spanFields(
        record,
        spans.get(record.id),
        after,
        startField,
        endField
      );
      if (!Object.keys(fields).length) {
        return;
      }
      try {
        await databaseRecords.update(database.id, record.id, fields);
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t("The dates could not be changed")
        );
      }
    },
    [startField, endField, spans, databaseRecords, database.id, t]
  );

  const handleCreate = React.useCallback(() => {
    if (!onCreateRecord) {
      return;
    }
    const prefill: Record<string, DatabaseCellInput> = {};
    if (canEdit && startField) {
      Object.assign(
        prefill,
        spanFields(
          { id: "", fields: {} },
          undefined,
          { start: today, end: today },
          startField,
          endField
        )
      );
    }
    void onCreateRecord(prefill);
  }, [onCreateRecord, canEdit, startField, endField, today]);

  const handlePreview = React.useCallback(
    (recordId: string, span: DaySpan | undefined) =>
      setPreview(span ? { id: recordId, span } : undefined),
    []
  );

  const handleToggleGroup = React.useCallback((key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  if (!startField) {
    return (
      <Empty>
        {t("Choose the date property of this timeline in the view options.")}
      </Empty>
    );
  }

  const spanOf = (recordId: string) =>
    preview?.id === recordId ? preview.span : spans.get(recordId);

  const firstRowIndex = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.type === "record" && !firstRowIndex.has(row.record.id)) {
      firstRowIndex.set(row.record.id, index);
    }
  });

  const arrows: { key: string; path: string; late: boolean }[] = [];
  if (dependencyField) {
    for (const [recordId, index] of firstRowIndex) {
      const row = rows[index];
      const span = spanOf(recordId);
      if (row.type !== "record" || !span) {
        continue;
      }
      const target = barGeometry(span, range.start, px);
      for (const link of toArray(row.record.fields[dependencyField.id])) {
        if (!isLinkItem(link)) {
          continue;
        }
        const blockerIndex = firstRowIndex.get(link.id);
        const blockerSpan = spanOf(link.id);
        if (blockerIndex === undefined || !blockerSpan) {
          continue;
        }
        const source = barGeometry(blockerSpan, range.start, px);
        arrows.push({
          key: `${link.id}>${recordId}`,
          late: blockerSpan.end >= span.start,
          path: dependencyPath(
            {
              x: source.left + source.width,
              y: blockerIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
            },
            { x: target.left, y: index * ROW_HEIGHT + ROW_HEIGHT / 2 }
          ),
        });
      }
    }
  }

  const zoomOptions: { value: DatabaseTimelineZoom; label: string }[] = [
    { value: "week", label: t("Week") },
    { value: "month", label: t("Month") },
    { value: "quarter", label: t("Quarter") },
    { value: "year", label: t("Year") },
  ];

  return (
    <Wrapper aria-busy={query.isLoading}>
      <Controls>
        <Tooltip content={showTable ? t("Hide table") : t("Show table")}>
          <IconButton
            type="button"
            aria-pressed={showTable}
            aria-label={showTable ? t("Hide table") : t("Show table")}
            onClick={handleToggleTable}
          >
            <TableIcon size={18} />
          </IconButton>
        </Tooltip>
        {undated.length > 0 && (
          <UndatedRows
            database={database}
            records={undated}
            onOpen={onOpenRecord}
          />
        )}
        <Spacer />
        <CompactSelect
          ariaLabel={t("Zoom")}
          value={zoom}
          options={zoomOptions}
          borderless
          onChange={handleZoom}
        />
        <Tooltip content={t("Previous")}>
          <IconButton
            type="button"
            aria-label={t("Previous")}
            onClick={() => handleStep(-1)}
          >
            <BackIcon size={18} />
          </IconButton>
        </Tooltip>
        <ControlButton type="button" onClick={scrollToToday}>
          {t("Today")}
        </ControlButton>
        <Tooltip content={t("Next")}>
          <IconButton
            type="button"
            aria-label={t("Next")}
            onClick={() => handleStep(1)}
          >
            <NextIcon size={18} />
          </IconButton>
        </Tooltip>
      </Controls>
      <Scroller ref={scrollerRef}>
        <Canvas style={{ width: tableWidth + timelineWidth }}>
          <HeaderRow style={{ height: HEADER_HEIGHT }}>
            {showTable && (
              <TableHead style={{ width: tableWidth }}>
                <HeadCell style={{ width: TITLE_WIDTH }}>
                  {database.primaryField?.name ?? t("Name")}
                </HeadCell>
                {tableFields.map((field) => (
                  <HeadCell key={field.id} style={{ width: COLUMN_WIDTH }}>
                    {field.name}
                  </HeadCell>
                ))}
              </TableHead>
            )}
            <Scale style={{ width: timelineWidth }} aria-hidden>
              {scale.top.map((unit) => (
                <TopUnit
                  key={unit.key}
                  style={{ left: unit.left, width: unit.width }}
                >
                  <span>{unit.label}</span>
                </TopUnit>
              ))}
              {scale.bottom.map((unit) => (
                <BottomUnit
                  key={unit.key}
                  style={{ left: unit.left, width: unit.width }}
                >
                  {unit.label}
                </BottomUnit>
              ))}
              <TodayMarker style={{ left: todayX + px / 2 }}>
                {format(today, "d", { locale })}
              </TodayMarker>
            </Scale>
          </HeaderRow>
          <Body style={{ height: Math.max(rows.length + 1, 3) * ROW_HEIGHT }}>
            <Grid
              aria-hidden
              style={{
                left: tableWidth,
                width: timelineWidth,
                backgroundImage: gridBackground(zoom, px, theme),
              }}
            />
            <TodayLine
              aria-hidden
              style={{ left: tableWidth + todayX + px / 2 }}
            />
            {!!arrows.length && (
              <Arrows
                aria-hidden
                style={{ left: tableWidth }}
                width={timelineWidth}
                height={rows.length * ROW_HEIGHT}
              >
                <defs>
                  <marker
                    id={markerId}
                    viewBox="0 0 6 6"
                    refX="5"
                    refY="3"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 z" fill="context-stroke" />
                  </marker>
                </defs>
                {arrows.map((arrow) => (
                  <path
                    key={arrow.key}
                    d={arrow.path}
                    fill="none"
                    stroke={arrow.late ? theme.danger : theme.textTertiary}
                    strokeWidth={1.5}
                    markerEnd={`url(#${markerId})`}
                  />
                ))}
              </Arrows>
            )}
            {rows.map((row) =>
              row.type === "group" ? (
                <GroupRow
                  key={row.key}
                  database={database}
                  field={groupField}
                  group={row.group}
                  collapsed={collapsed.has(row.group.key)}
                  width={tableWidth + timelineWidth}
                  onToggle={handleToggleGroup}
                />
              ) : (
                <Row key={row.key} style={{ height: ROW_HEIGHT }}>
                  {showTable && (
                    <TableCells
                      database={database}
                      record={row.record}
                      fields={tableFields}
                      width={tableWidth}
                      onOpen={onOpenRecord}
                    />
                  )}
                  <Track
                    database={database}
                    view={view}
                    record={row.record}
                    span={spanOf(row.record.id)}
                    savedSpan={spans.get(row.record.id)}
                    rangeStart={range.start}
                    px={px}
                    zoom={zoom}
                    width={timelineWidth}
                    canEdit={canEdit}
                    hasEnd={!!endField}
                    locale={locale}
                    onPreview={handlePreview}
                    onCommit={handleCommit}
                    onOpen={onOpenRecord}
                  />
                </Row>
              )
            )}
            {!readOnly && onCreateRecord && (
              <Row style={{ height: ROW_HEIGHT }}>
                <NewRow
                  type="button"
                  style={{ width: showTable ? tableWidth : 160 }}
                  onClick={handleCreate}
                >
                  <PlusIcon size={18} />
                  {t("New page")}
                </NewRow>
              </Row>
            )}
          </Body>
        </Canvas>
      </Scroller>
    </Wrapper>
  );
});

interface GroupRowProps {
  database: Database;
  field: DatabaseField | undefined;
  group: RecordGroup;
  collapsed: boolean;
  width: number;
  onToggle: (key: string) => void;
}

const GroupRow = observer(function GroupRow({
  database,
  field,
  group,
  collapsed,
  width,
  onToggle,
}: GroupRowProps) {
  if (!field) {
    return null;
  }

  return (
    <GroupLine style={{ height: ROW_HEIGHT, width }}>
      <GroupButton
        type="button"
        aria-expanded={!collapsed}
        onClick={() => onToggle(group.key)}
      >
        <Chevron $collapsed={collapsed}>
          <CollapsedIcon size={18} />
        </Chevron>
        <GroupValue>
          <GroupLabel database={database} field={field} value={group.value} />
        </GroupValue>
        <GroupCount>{group.records.length}</GroupCount>
      </GroupButton>
    </GroupLine>
  );
});

interface UndatedRowsProps {
  database: Database;
  records: DatabaseRecord[];
  onOpen: (recordId: string) => void;
}

/**
 * Notion's « No date (n) »: the rows without a date, kept off the timeline and
 * listed in a menu that opens them.
 *
 * @param props the rows and how to open one.
 * @returns the button and its menu.
 */
const UndatedRows = observer(function UndatedRows({
  database,
  records,
  onOpen,
}: UndatedRowsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <ControlButton type="button">
          {t("No date ({{ count }})", { count: records.length })}
        </ControlButton>
      </PopoverTrigger>
      <MenuPanel
        aria-label={t("Rows without a date")}
        side="bottom"
        align="start"
        width={280}
        shrink
      >
        {records.map((record) => (
          <MenuItem
            key={record.id}
            type="button"
            onClick={() => {
              setOpen(false);
              onOpen(record.id);
            }}
          >
            <MenuLabel>
              <RecordTitle database={database} record={record} />
            </MenuLabel>
          </MenuItem>
        ))}
      </MenuPanel>
    </Popover>
  );
});

interface TableCellsProps {
  database: Database;
  record: DatabaseRecord;
  fields: DatabaseField[];
  width: number;
  onOpen: (recordId: string) => void;
}

const TableCells = observer(function TableCells({
  database,
  record,
  fields,
  width,
  onOpen,
}: TableCellsProps) {
  return (
    <TableSide style={{ width }}>
      <TitleCell
        style={{ width: TITLE_WIDTH }}
        {...openableProps(() => onOpen(record.id))}
      >
        <RecordTitle database={database} record={record} />
      </TitleCell>
      {fields.map((field) => {
        const { Renderer } = getCell(field.type);
        return (
          <Cell key={field.id} style={{ width: COLUMN_WIDTH }}>
            <Renderer
              field={field}
              value={record.fields[field.id]}
              database={database}
              record={record}
              variant="table"
            />
          </Cell>
        );
      })}
    </TableSide>
  );
});

interface TrackProps {
  database: Database;
  view: DatabaseView;
  record: DatabaseRecord;
  /** The span drawn, the drag preview included. */
  span: DaySpan | undefined;
  /** The saved span, where drags start from. */
  savedSpan: DaySpan | undefined;
  rangeStart: Date;
  px: number;
  zoom: DatabaseTimelineZoom;
  width: number;
  canEdit: boolean;
  hasEnd: boolean;
  locale: ReturnType<typeof useDateLocale>;
  onPreview: (recordId: string, span: DaySpan | undefined) => void;
  onCommit: (record: DatabaseRecord, span: DaySpan) => void;
  onOpen: (recordId: string) => void;
}

const Track = observer(function Track({
  database,
  view,
  record,
  span,
  savedSpan,
  rangeStart,
  px,
  zoom,
  width,
  canEdit,
  hasEnd,
  locale,
  onPreview,
  onCommit,
  onOpen,
}: TrackProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [ghostX, setGhostX] = React.useState<number>();
  const dragRef = React.useRef<{
    mode: BarDragMode;
    startX: number;
    days: number;
    moved: boolean;
  }>();

  const handleTrackMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (span || !canEdit) {
      return;
    }
    const x = ev.clientX - ev.currentTarget.getBoundingClientRect().left;
    setGhostX(dayToX(xToDay(x, rangeStart, px), rangeStart, px));
  };

  const handleTrackClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (span || !canEdit || ev.target !== ev.currentTarget) {
      return;
    }
    const x = ev.clientX - ev.currentTarget.getBoundingClientRect().left;
    const start = xToDay(x, rangeStart, px);
    onCommit(record, {
      start,
      end: hasEnd ? addDays(start, NEW_SPAN_DAYS[zoom] - 1) : start,
    });
    setGhostX(undefined);
  };

  const handlePointerDown =
    (mode: BarDragMode) => (ev: React.PointerEvent<HTMLElement>) => {
      if (ev.button !== 0) {
        return;
      }
      ev.stopPropagation();
      ev.currentTarget.setPointerCapture(ev.pointerId);
      dragRef.current = { mode, startX: ev.clientX, days: 0, moved: false };
    };

  const handlePointerMove = (ev: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || !savedSpan) {
      return;
    }
    const dx = ev.clientX - drag.startX;
    if (Math.abs(dx) > 3) {
      drag.moved = true;
    }
    if (!canEdit || !drag.moved) {
      return;
    }
    const days = Math.round(dx / px);
    if (days !== drag.days) {
      drag.days = days;
      onPreview(record.id, dragSpan(savedSpan, drag.mode, days));
    }
  };

  const handlePointerUp = (ev: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    dragRef.current = undefined;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    if (!drag) {
      return;
    }
    if (!drag.moved) {
      onPreview(record.id, undefined);
      if (drag.mode === "move") {
        onOpen(record.id);
      }
      return;
    }
    if (canEdit && savedSpan && drag.days) {
      const next = dragSpan(savedSpan, drag.mode, drag.days);
      void Promise.resolve(onCommit(record, next)).finally(() =>
        onPreview(record.id, undefined)
      );
      return;
    }
    onPreview(record.id, undefined);
  };

  const handleKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      onOpen(record.id);
      return;
    }
    if (!canEdit || !savedSpan) {
      return;
    }
    const step = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
    if (!step) {
      return;
    }
    ev.preventDefault();
    const mode: BarDragMode = ev.shiftKey && hasEnd ? "end" : "move";
    onCommit(record, dragSpan(savedSpan, mode, step));
  };

  const geometry: BarGeometry | undefined = span
    ? barGeometry(span, rangeStart, px)
    : undefined;
  const title = recordTitle(database, record) || t("Untitled");
  const label = span
    ? `${title}, ${format(span.start, "d MMM yyyy", { locale })}${
        differenceInCalendarDays(span.end, span.start)
          ? ` – ${format(span.end, "d MMM yyyy", { locale })}`
          : ""
      }`
    : title;
  const color = recordColor(database, view, record, theme);
  const titleInside = !!geometry && geometry.width >= 90;

  return (
    <TrackArea
      style={{ width }}
      $datable={!span && canEdit}
      onPointerMove={handleTrackMove}
      onPointerLeave={() => setGhostX(undefined)}
      onClick={handleTrackClick}
    >
      {!span && canEdit && ghostX !== undefined && (
        <Ghost
          aria-hidden
          style={{
            left: ghostX,
            width: (hasEnd ? NEW_SPAN_DAYS[zoom] : 1) * px,
          }}
        />
      )}
      {geometry && (
        <Bar
          role="button"
          tabIndex={0}
          aria-label={label}
          aria-keyshortcuts={
            canEdit
              ? "ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
              : undefined
          }
          title={
            canEdit
              ? t("Drag to move, drag an edge to change a date")
              : undefined
          }
          $color={color}
          $editable={canEdit}
          style={{ left: geometry.left, width: Math.max(geometry.width, 6) }}
          onPointerDown={handlePointerDown("move")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          {canEdit && hasEnd && (
            <Handle
              $side="start"
              aria-hidden
              onPointerDown={handlePointerDown("start")}
            />
          )}
          {titleInside && (
            <BarTitle>
              <RecordTitle database={database} record={record} />
            </BarTitle>
          )}
          {canEdit && hasEnd && (
            <Handle
              $side="end"
              aria-hidden
              onPointerDown={handlePointerDown("end")}
            />
          )}
        </Bar>
      )}
      {geometry && !titleInside && (
        <OutsideTitle
          aria-hidden
          style={{ left: geometry.left + Math.max(geometry.width, 6) + 6 }}
        >
          <RecordTitle database={database} record={record} />
        </OutsideTitle>
      )}
    </TrackArea>
  );
});

/**
 * The start date property of a timeline: the timeline's own, else the
 * calendar option, else the first date property.
 *
 * @param database the database.
 * @param view the timeline view.
 * @returns the field, or undefined when the database has no date.
 */
function timelineStartField(
  database: Database,
  view: DatabaseView
): DatabaseField | undefined {
  const id =
    view.overrides.timeline?.startFieldId || view.options.startDateFieldId;
  const chosen = id ? database.fieldById(id) : undefined;
  return chosen ?? defaultDateField(database.fields ?? []);
}

/**
 * The end date property of a timeline: the timeline's own, else the calendar
 * option, else the end paired with the start property (a Notion date range).
 *
 * @param database the database.
 * @param view the timeline view.
 * @param startField the start property.
 * @returns the field, or undefined for single-day rows.
 */
function timelineEndField(
  database: Database,
  view: DatabaseView,
  startField: DatabaseField | undefined
): DatabaseField | undefined {
  const timeline = view.overrides.timeline;
  // An empty id is the reader's explicit « None ».
  const id =
    timeline?.endFieldId !== undefined
      ? timeline.endFieldId
      : timeline?.startFieldId
        ? startField?.meta?.endFieldId
        : (view.options.endDateFieldId ?? startField?.meta?.endFieldId);
  const field = id ? database.fieldById(id) : undefined;
  return field && field.id !== startField?.id ? field : undefined;
}

function gridBackground(
  zoom: DatabaseTimelineZoom,
  px: number,
  theme: { divider: string; backgroundSecondary: string }
): string {
  const line = `${theme.divider} 0 1px, transparent 1px`;
  switch (zoom) {
    case "week":
    case "month":
      return [
        `repeating-linear-gradient(90deg, ${line} ${px}px)`,
        `repeating-linear-gradient(90deg, transparent 0 ${px * 5}px, ${theme.backgroundSecondary} ${px * 5}px ${px * 7}px)`,
      ].join(", ");
    case "quarter":
      return `repeating-linear-gradient(90deg, ${line} ${px * 7}px)`;
    case "year":
      return "none";
  }
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0 16px;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Spacer = styled.div`
  flex: 1;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${s("textTertiary")};
  cursor: var(--pointer);

  &:hover,
  &:focus-visible,
  &[aria-pressed="true"] {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
    outline: none;
  }
`;

const ControlButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
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

  svg {
    color: ${s("textTertiary")};
  }
`;

const Scroller = styled.div`
  position: relative;
  max-height: 640px;
  overflow: auto;
  border: 1px solid ${s("divider")};
  ${borderRadius(8)}
  overscroll-behavior-x: contain;
`;

const Canvas = styled.div`
  position: relative;
  min-width: 100%;
`;

const HeaderRow = styled.div`
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  background: ${s("background")};
  border-bottom: 1px solid ${s("divider")};
`;

// The side table's widths are the track's offset: padding and borders must
// stay inside them, and a cell never spills over the timeline.
const tablePart = css`
  box-sizing: border-box;
`;

const TableHead = styled.div`
  ${tablePart}
  position: sticky;
  left: 0;
  z-index: 5;
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
  overflow: hidden;
  background: ${s("background")};
  border-inline-end: 1px solid ${s("divider")};
`;

const HeadCell = styled.div`
  ${tablePart}
  flex-shrink: 0;
  padding: 0 8px 6px;
  color: ${s("textTertiary")};
  font-size: 12px;
  ${ellipsis()}
`;

const Scale = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const TopUnit = styled.div`
  position: absolute;
  top: 0;
  height: 26px;
  border-inline-start: 1px solid ${s("divider")};
  color: ${s("textSecondary")};
  font-size: 12px;
  font-weight: 500;

  span {
    position: sticky;
    left: 8px;
    display: inline-block;
    padding: 6px 8px 0;
    white-space: nowrap;
  }
`;

const BottomUnit = styled.div`
  position: absolute;
  top: 26px;
  height: 26px;
  line-height: 26px;
  color: ${s("textTertiary")};
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
`;

const TodayMarker = styled.div`
  position: absolute;
  top: 29px;
  z-index: 1;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  transform: translateX(-50%);
  ${borderRadius(10)}
  background: ${(props) => props.theme.brand.red};
  color: ${s("white")};
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  pointer-events: none;
`;

const Body = styled.div`
  position: relative;
`;

const Grid = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
`;

const TodayLine = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 2px;
  margin-inline-start: -1px;
  background: ${(props) => props.theme.brand.red};
  pointer-events: none;
`;

const Arrows = styled.svg`
  position: absolute;
  top: 0;
  z-index: 1;
  overflow: visible;
  pointer-events: none;
`;

const Row = styled.div`
  position: relative;
  display: flex;
  border-bottom: 1px solid transparent;
`;

const TableSide = styled.div`
  ${tablePart}
  position: sticky;
  left: 0;
  z-index: 3;
  display: flex;
  flex-shrink: 0;
  overflow: hidden;
  background: ${s("background")};
  border-inline-end: 1px solid ${s("divider")};
  border-bottom: 1px solid ${s("divider")};
`;

const TitleCell = styled.div`
  ${tablePart}
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
  cursor: var(--pointer);
  ${ellipsis()}

  &:hover {
    background: ${s("listItemHoverBackground")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: -2px;
  }
`;

const Cell = styled.div`
  ${tablePart}
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 13px;
  overflow: hidden;
  border-inline-start: 1px solid ${s("divider")};
`;

const TrackArea = styled.div<{ $datable: boolean }>`
  position: relative;
  flex-shrink: 0;
  cursor: ${(props) => (props.$datable ? "copy" : "default")};
`;

const Ghost = styled.div`
  position: absolute;
  top: 6px;
  height: 24px;
  ${borderRadius(4)}
  border: 1px dashed ${s("textTertiary")};
  pointer-events: none;
`;

const Bar = styled.div<{ $color: string | undefined; $editable: boolean }>`
  position: absolute;
  top: 5px;
  z-index: 1;
  display: flex;
  align-items: center;
  height: 26px;
  ${borderRadius(5)}
  background: ${(props) => props.$color ?? props.theme.background};
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "rgba(255, 255, 255, 0.094) 0 0 0 1px, rgba(0, 0, 0, 0.3) 0 1px 2px"
      : "rgba(15, 15, 15, 0.12) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 1px 2px"};
  cursor: ${(props) => (props.$editable ? "grab" : "pointer")};
  touch-action: none;
  user-select: none;

  &:active {
    cursor: ${(props) => (props.$editable ? "grabbing" : "pointer")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: 1px;
  }
`;

const Handle = styled.span<{ $side: "start" | "end" }>`
  position: absolute;
  top: 0;
  bottom: 0;
  ${(props) =>
    props.$side === "start"
      ? css`
          left: 0;
        `
      : css`
          right: 0;
        `}
  width: 8px;
  cursor: ew-resize;

  &::after {
    content: "";
    position: absolute;
    top: 7px;
    bottom: 7px;
    ${(props) => (props.$side === "start" ? "left: 3px;" : "right: 3px;")}
    width: 2px;
    border-radius: 1px;
    background: ${s("textTertiary")};
    opacity: 0;
  }

  ${Bar}:hover &::after {
    opacity: 1;
  }
`;

const BarTitle = styled.span`
  flex: 1;
  min-width: 0;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 500;
  color: ${s("text")};
  pointer-events: none;
  ${ellipsis()}
`;

const OutsideTitle = styled.span`
  position: absolute;
  top: 0;
  height: ${ROW_HEIGHT}px;
  line-height: ${ROW_HEIGHT}px;
  max-width: 320px;
  font-size: 13px;
  color: ${s("textSecondary")};
  pointer-events: none;
  ${ellipsis()}
`;

const GroupLine = styled.div`
  display: flex;
  align-items: center;
  background: ${s("backgroundSecondary")};
  border-bottom: 1px solid ${s("divider")};
`;

const GroupButton = styled.button`
  position: sticky;
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 480px;
  height: 28px;
  margin: 0 4px;
  padding: 0 6px 0 2px;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${s("text")};
  font-size: 14px;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    outline: none;
  }
`;

const Chevron = styled.span<{ $collapsed: boolean }>`
  display: inline-flex;
  color: ${s("textTertiary")};
  transform: rotate(${(props) => (props.$collapsed ? "-90deg" : "0deg")});
  transition: transform 120ms ease;
`;

const GroupValue = styled.span`
  min-width: 0;
  font-weight: 500;
  ${ellipsis()}
`;

const GroupCount = styled.span`
  color: ${s("textTertiary")};
  font-size: 13px;
  opacity: 0;
  transition: opacity 100ms ease;

  ${GroupButton}:hover &,
  ${GroupButton}:focus-visible & {
    opacity: 1;
  }
`;

const NewRow = styled.button`
  position: sticky;
  left: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  background: ${s("background")};
  color: ${s("textTertiary")};
  font-size: 14px;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
    outline: none;
  }
`;

const Empty = styled.p`
  margin: 16px 0;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

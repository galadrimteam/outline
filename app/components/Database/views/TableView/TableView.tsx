import type {
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseFilter,
  DatabaseGroupPoint,
  DatabaseRecordPosition,
  DatabaseStatisticFunc,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import ConfirmationDialog from "~/components/ConfirmationDialog";
import PlaceholderText from "~/components/PlaceholderText";
import useStores from "~/hooks/useStores";
import { cellValueToText } from "../../cells/format";
import { getCell } from "../../cells/registry";
import { orderPatch, orderedFields } from "../../toolbar/columns";
import type { DatabaseViewProps } from "../../types";
import { GroupAddRow, GroupHeaderRow } from "./GroupRows";
import { GUTTER_WIDTH, moveId, rowLayout, tableColumns } from "./layout";
import { moveCell, navigationKey } from "./navigation";
import type { AddDisplayRow, GroupPathItem, RecordDisplayRow } from "./rows";
import { buildDisplayRows, dropSide, pathChange, pathPrefill } from "./rows";
import { SelectionBar } from "./SelectionBar";
import {
  Body,
  Grid,
  NewButton,
  Scroller,
  SpanningContent,
  SpanningLine,
} from "./styles";
import { TableFooter } from "./TableFooter";
import { TableHeader } from "./TableHeader";
import { TableRow } from "./TableRow";
import { useRowVirtualizer } from "./useRowVirtualizer";
import { useTableClipboard } from "./useTableClipboard";

/** Props of the table view: the block's view props, and the hook that opens the view's filter. */
export interface TableViewProps extends DatabaseViewProps {
  /** Opens the filter of the view with a rule on a property ("Filter" in a column menu). */
  onFilter?: (fieldId: string) => void;
}

interface ActiveCell {
  recordId: string;
  fieldId: string;
}

interface DropTarget {
  recordId: string;
  side: DatabaseRecordPosition;
}

/** Width of the last column, holding the "+" that adds a property. */
const ADD_COLUMN_WIDTH = 48;

/**
 * The table layout of a database view, like Notion's: resizable, reorderable and frozen columns,
 * inline editing with keyboard navigation, "Open" on titles, groups, calculations, row
 * selection and manual row order.
 *
 * @param props the database, the view, its rows and the callbacks of the block.
 * @returns the table.
 */
export const TableView = observer(function TableView_({
  database,
  view,
  query,
  readOnly,
  onOpenRecord,
  onCreateRecord,
  onFilter,
}: TableViewProps) {
  const { t } = useTranslation();
  const { databaseRecords, databases, dialogs } = useStores();
  const gridRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const editingRef = React.useRef(false);
  const lastToggled = React.useRef<string | null>(null);

  const [widths, setWidths] = React.useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [points, setPoints] = React.useState<DatabaseGroupPoint[]>();
  const [results, setResults] = React.useState<
    Record<string, { value: number | string | null }>
  >({});
  const [selected, setSelected] = React.useState<string[]>([]);
  const [active, setActive] = React.useState<ActiveCell | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editInput, setEditInput] = React.useState<string>();
  const [menuFieldId, setMenuFieldId] = React.useState<string | null>(null);
  const [drop, setDrop] = React.useState<DropTarget | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [scrolled, setScrolled] = React.useState(false);

  React.useLayoutEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const fields = database.fields;
  const columns = React.useMemo(
    () => tableColumns(fields ?? [], view, widths),
    [fields, view, widths]
  );
  const layout = rowLayout(view.options.rowHeight);
  const template = `${GUTTER_WIDTH}px ${columns
    .map((column) => `${column.width}px`)
    .join(" ")} minmax(${ADD_COLUMN_WIDTH}px, 1fr)`;
  const totalWidth =
    GUTTER_WIDTH +
    columns.reduce((sum, column) => sum + column.width, 0) +
    ADD_COLUMN_WIDTH;

  const grouped = !!view.group?.length;
  const records = query.records;
  const canCreate = !readOnly && !!onCreateRecord;
  const effectiveSort =
    query.params.sort !== undefined ? query.params.sort : view.sort;
  const draggable = !readOnly && !effectiveSort?.sortObjs.length;
  const fieldById = React.useCallback(
    (id: string) => database.fieldById(id),
    [database]
  );

  const displayRows = React.useMemo(
    () =>
      buildDisplayRows({
        records,
        points: grouped ? points : undefined,
        group: view.group,
        collapsed,
        hasMore: query.hasMore,
        canCreate,
      }),
    [records, grouped, points, view.group, collapsed, query.hasMore, canCreate]
  );
  const recordRows = React.useMemo(
    () =>
      displayRows.filter(
        (row): row is RecordDisplayRow => row.type === "record"
      ),
    [displayRows]
  );
  const rowIds = React.useMemo(
    () => recordRows.map((row) => row.record.id),
    [recordRows]
  );
  const columnFields = React.useMemo(
    () => columns.map((column) => column.field),
    [columns]
  );
  const selectedIds = React.useMemo(() => {
    const shown = new Set(records.map((record) => record.id));
    return selected.filter((id) => shown.has(id));
  }, [records, selected]);

  const searchParams = React.useMemo(
    () => ({
      filter: combineFilters(query.params.filter, query.params.extraFilter),
      search: query.params.search || undefined,
    }),
    [query]
  );

  React.useEffect(() => {
    void query.fetch();
  }, [query]);

  const groupKey = JSON.stringify(view.group ?? null);
  React.useEffect(() => {
    if (!grouped) {
      setPoints(undefined);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      databaseRecords
        .groups(database.id, view.id, searchParams)
        .then((next) => {
          if (!cancelled) {
            setPoints(next);
          }
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    database.id,
    databaseRecords,
    groupKey,
    grouped,
    query.total,
    records,
    searchParams,
    view.id,
  ]);

  const fieldStats = React.useMemo(() => {
    const stats: Record<string, DatabaseStatisticFunc> = {};
    for (const column of columns) {
      const func = view.columnMeta[column.field.id]?.statisticFunc;
      if (func) {
        stats[column.field.id] = func;
      }
    }
    return stats;
  }, [columns, view.columnMeta]);
  const statsKey = JSON.stringify(fieldStats);

  React.useEffect(() => {
    if (!Object.keys(fieldStats).length) {
      setResults({});
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      databaseRecords
        .aggregate(database.id, view.id, fieldStats, searchParams)
        .then((next) => {
          if (!cancelled) {
            setResults(next);
          }
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // fieldStats is read through statsKey, which changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    database.id,
    databaseRecords,
    query.total,
    records,
    searchParams,
    statsKey,
    view.id,
  ]);

  const estimateSize = React.useCallback(
    (index: number) => {
      const row = displayRows[index];
      if (row?.type === "group") {
        return 41;
      }
      if (row?.type === "add") {
        return 35;
      }
      return layout.height + 1;
    },
    [displayRows, layout.height]
  );
  const getItemKey = React.useCallback(
    (index: number) => displayRows[index]?.key ?? String(index),
    [displayRows]
  );
  const virtualizer = useRowVirtualizer({
    count: displayRows.length,
    estimateSize,
    getItemKey,
    containerRef: bodyRef,
  });

  const lastIndex = virtualizer.items[virtualizer.items.length - 1]?.index ?? 0;
  React.useEffect(() => {
    if (
      query.hasMore &&
      !query.isLoading &&
      lastIndex >= displayRows.length - 15
    ) {
      void query.loadMore();
    }
  }, [displayRows.length, lastIndex, query, query.hasMore, query.isLoading]);

  const showError = React.useCallback(
    (err: unknown) =>
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t("The change could not be saved")
      ),
    [t]
  );

  const handleChange = React.useCallback(
    (recordId: string, fieldId: string, value: DatabaseCellInput) => {
      databaseRecords
        .update(database.id, recordId, { [fieldId]: value })
        .catch(showError);
    },
    [database.id, databaseRecords, showError]
  );

  const handleChangeFields = React.useCallback(
    (recordId: string, values: Record<string, DatabaseCellInput>) => {
      databaseRecords.update(database.id, recordId, values).catch(showError);
    },
    [database.id, databaseRecords, showError]
  );

  const handleActivate = React.useCallback(
    (recordId: string, fieldId: string, edit: boolean) => {
      setActive({ recordId, fieldId });
      setEditInput(undefined);
      setEditing(edit);
    },
    []
  );

  const focusGrid = React.useCallback(() => {
    requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (!editingRef.current && (!focused || focused === document.body)) {
        gridRef.current?.focus({ preventScroll: true });
      }
    });
  }, []);

  const handleCloseEditor = React.useCallback(() => {
    setEditing(false);
    setEditInput(undefined);
    focusGrid();
  }, [focusGrid]);

  const handleOpenRecord = React.useCallback(
    (recordId: string) => onOpenRecord(recordId),
    [onOpenRecord]
  );

  const handleCreate = React.useCallback(
    async (path: GroupPathItem[] = []) => {
      if (!onCreateRecord) {
        return;
      }
      const before = new Set(query.recordIds);
      const prefill = pathPrefill(path, fieldById);
      try {
        await onCreateRecord(Object.keys(prefill).length ? prefill : undefined);
      } catch (err) {
        showError(err);
        return;
      }
      const created = query.recordIds.find((id) => !before.has(id));
      const primary = database.primaryField;
      if (created && primary && getCell(primary.type).isEditable(primary)) {
        setActive({ recordId: created, fieldId: primary.id });
        setEditInput(undefined);
        setEditing(true);
      }
    },
    [database, fieldById, onCreateRecord, query, showError]
  );

  const handleCreateInGroup = React.useCallback(
    (row: AddDisplayRow) => void handleCreate(row.path),
    [handleCreate]
  );

  const handleToggleGroup = React.useCallback(
    (groupId: string) => {
      setCollapsed((current) => {
        const point = points?.find(
          (item) => item.type === "header" && item.id === groupId
        );
        const now =
          current[groupId] ?? (point?.type === "header" && point.isCollapsed);
        return { ...current, [groupId]: !now };
      });
    },
    [points]
  );

  const handleToggleSelected = React.useCallback(
    (recordId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      const anchor = lastToggled.current;
      lastToggled.current = recordId;
      setSelected((current) => {
        if (event.shiftKey && anchor) {
          const ids = recordRows.map((row) => row.record.id);
          const from = ids.indexOf(anchor);
          const to = ids.indexOf(recordId);
          if (from !== -1 && to !== -1) {
            const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
            return Array.from(new Set([...current, ...range]));
          }
        }
        return current.includes(recordId)
          ? current.filter((id) => id !== recordId)
          : [...current, recordId];
      });
    },
    [recordRows]
  );

  const handleToggleAll = React.useCallback(() => {
    setSelected((current) =>
      current.length ? [] : records.map((record) => record.id)
    );
  }, [records]);

  const handleDeleteSelected = React.useCallback(() => {
    const ids = selectedIds;
    dialogs.openModal({
      title: t("Delete rows?"),
      content: (
        <ConfirmationDialog
          danger
          submitText={t("Delete")}
          onSubmit={async () => {
            await databaseRecords.delete(database.id, ids);
            setSelected([]);
          }}
        >
          {t("{{ count }} rows and their pages will be deleted.", {
            count: ids.length,
          })}
        </ConfirmationDialog>
      ),
    });
  }, [database.id, databaseRecords, dialogs, selectedIds, t]);

  const handleDuplicateSelected = React.useCallback(async () => {
    const ids = selectedIds;
    setSelected([]);
    try {
      for (const id of ids) {
        await databaseRecords.duplicate(database.id, id);
      }
    } catch (err) {
      showError(err);
    }
  }, [database.id, databaseRecords, selectedIds, showError]);

  const handleResize = React.useCallback((fieldId: string, width: number) => {
    setWidths((current) => ({ ...current, [fieldId]: width }));
  }, []);

  const handleResizeEnd = React.useCallback(
    (fieldId: string, width: number) => {
      databases
        .updateView(database.id, view.id, {
          columnMeta: { [fieldId]: { width } },
        })
        .catch(showError)
        .finally(() =>
          setWidths((current) => {
            const next = { ...current };
            delete next[fieldId];
            return next;
          })
        );
    },
    [database.id, databases, showError, view.id]
  );

  const handleReorderColumn = React.useCallback(
    (fieldId: string, overFieldId: string) => {
      const ids = orderedFields(fields ?? [], view).map((field) => field.id);
      const next = moveId(ids, fieldId, overFieldId);
      if (next === ids) {
        return;
      }
      databases
        .updateView(database.id, view.id, {
          columnMeta: orderPatch(view, next),
        })
        .catch(showError);
    },
    [database.id, databases, fields, showError, view]
  );

  const sortOrderOf = React.useCallback(
    (fieldId: string) =>
      effectiveSort?.sortObjs.find((item) => item.fieldId === fieldId)?.order,
    [effectiveSort]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragStart = React.useCallback(
    ({ active: dragged }: DragStartEvent) => {
      setDraggingId(String(dragged.id));
    },
    []
  );

  const handleDragMove = React.useCallback(
    ({ active: dragged, over }: DragMoveEvent) => {
      const rect = dragged.rect.current.translated;
      if (!over || over.id === dragged.id || !rect) {
        setDrop(null);
        return;
      }
      const side = dropSide(rect.top + rect.height / 2, over.rect);
      const recordId = String(over.id);
      setDrop((current) =>
        current?.recordId === recordId && current.side === side
          ? current
          : { recordId, side }
      );
    },
    []
  );

  const handleDragEnd = React.useCallback(
    ({ active: dragged }: DragEndEvent) => {
      const target = drop;
      setDrop(null);
      setDraggingId(null);
      const draggedId = String(dragged.id);
      if (!target || target.recordId === draggedId) {
        return;
      }
      const moving = selectedIds.includes(draggedId)
        ? recordRows
            .map((row) => row.record.id)
            .filter((id) => selectedIds.includes(id))
        : [draggedId];
      if (moving.includes(target.recordId)) {
        return;
      }
      const pathOf = (id: string) =>
        recordRows.find((row) => row.record.id === id)?.path ?? [];
      const values = pathChange(
        pathOf(draggedId),
        pathOf(target.recordId),
        fieldById
      );
      databaseRecords
        .move(database.id, view.id, {
          recordIds: moving,
          anchorId: target.recordId,
          position: target.side,
          fields: values,
        })
        .catch(showError);
    },
    [
      database.id,
      databaseRecords,
      drop,
      fieldById,
      recordRows,
      selectedIds,
      showError,
      view.id,
    ]
  );

  const handleDragCancel = React.useCallback(() => {
    setDrop(null);
    setDraggingId(null);
  }, []);

  const moveActive = React.useCallback(
    (key: NonNullable<ReturnType<typeof navigationKey>>) => {
      if (!rowIds.length || !columnFields.length) {
        return;
      }
      const row = active ? rowIds.indexOf(active.recordId) : -1;
      const col = active
        ? columnFields.findIndex((field) => field.id === active.fieldId)
        : -1;
      if (row === -1 || col === -1) {
        setActive({ recordId: rowIds[0], fieldId: columnFields[0].id });
        return;
      }
      const next = moveCell(
        { row, col },
        key,
        rowIds.length,
        columnFields.length
      );
      setActive({
        recordId: rowIds[next.row],
        fieldId: columnFields[next.col].id,
      });
    },
    [active, columnFields, rowIds]
  );

  const { bridge: clipboardBridge, handleKeyDown: handleClipboardKey } =
    useTableClipboard({
      database,
      gridRef,
      active,
      rowIds,
      fields: columnFields,
      readOnly,
      onError: showError,
    });

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (menuFieldId || event.nativeEvent.isComposing) {
        return;
      }
      if (editing) {
        if (event.key === "Tab") {
          event.preventDefault();
          setEditing(false);
          setEditInput(undefined);
          moveActive(event.shiftKey ? "ShiftTab" : "Tab");
          focusGrid();
        }
        return;
      }
      if (event.target !== gridRef.current) {
        return;
      }
      if (handleClipboardKey(event)) {
        return;
      }

      const key = navigationKey(event);
      if (key) {
        event.preventDefault();
        moveActive(key);
        return;
      }
      if (!active) {
        return;
      }

      const field = database.fieldById(active.fieldId);
      const cell = field ? getCell(field.type) : undefined;
      const editable =
        !readOnly && !!field && !!cell?.Editor && !!cell?.isEditable(field);

      switch (event.key) {
        case "Enter":
          event.preventDefault();
          if (editable) {
            setEditInput(undefined);
            setEditing(true);
          } else if (field?.isPrimary) {
            onOpenRecord(active.recordId);
          }
          return;
        case " ":
          event.preventDefault();
          onOpenRecord(active.recordId);
          return;
        case "Escape":
          setActive(null);
          return;
        case "Backspace":
        case "Delete":
          if (editable) {
            event.preventDefault();
            handleChange(active.recordId, active.fieldId, null);
          }
          return;
        default:
          if (editable && cell?.opensOnTyping && isTypedCharacter(event)) {
            event.preventDefault();
            setEditInput(event.key);
            setEditing(true);
          }
          return;
      }
    },
    [
      active,
      database,
      editing,
      focusGrid,
      handleChange,
      handleClipboardKey,
      menuFieldId,
      moveActive,
      onOpenRecord,
      readOnly,
    ]
  );

  React.useEffect(() => {
    if (!active) {
      return;
    }
    const index = displayRows.findIndex(
      (row) => row.type === "record" && row.record.id === active.recordId
    );
    if (index !== -1) {
      virtualizer.scrollToIndex(index);
    }
    const frame = requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector(
          `[data-cell="${CSS.escape(`${active.recordId}:${active.fieldId}`)}"]`
        )
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
    // Scrolls when the active cell changes, not on every render of the rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.recordId, active?.fieldId]);

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) =>
      setScrolled(event.currentTarget.scrollLeft > 0),
    []
  );

  const draggedRecord = draggingId
    ? databaseRecords.recordById(database.id, draggingId)
    : undefined;
  const primary = database.primaryField;

  return (
    <Wrapper>
      {clipboardBridge}
      {selectedIds.length > 0 && !readOnly && (
        <SelectionBar
          count={selectedIds.length}
          onDuplicate={() => void handleDuplicateSelected()}
          onDelete={handleDeleteSelected}
          onClear={() => setSelected([])}
        />
      )}
      <Scroller data-scrolled={scrolled || undefined} onScroll={handleScroll}>
        <Grid
          ref={gridRef}
          role="grid"
          aria-label={view.name}
          aria-rowcount={query.total}
          aria-colcount={columns.length}
          tabIndex={0}
          style={{ width: totalWidth }}
          onKeyDown={handleKeyDown}
        >
          <TableHeader
            database={database}
            view={view}
            columns={columns}
            template={template}
            readOnly={readOnly}
            sortOrderOf={sortOrderOf}
            selectedCount={selectedIds.length}
            rowCount={records.length}
            onToggleAll={handleToggleAll}
            menuFieldId={menuFieldId}
            onMenuChange={setMenuFieldId}
            onResize={handleResize}
            onResizeEnd={handleResizeEnd}
            onReorder={handleReorderColumn}
            onFilter={onFilter}
          />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <Body
              ref={bodyRef}
              role="rowgroup"
              style={{ height: virtualizer.totalSize }}
            >
              {virtualizer.items.map((item) => {
                const row = displayRows[item.index];
                if (!row) {
                  return null;
                }
                const start = item.start - virtualizer.scrollMargin;

                if (row.type === "group") {
                  return (
                    <GroupHeaderRow
                      key={row.key}
                      database={database}
                      row={row}
                      index={item.index}
                      start={start}
                      template={template}
                      measureElement={virtualizer.measureElement}
                      onToggle={handleToggleGroup}
                    />
                  );
                }
                if (row.type === "add") {
                  return (
                    <GroupAddRow
                      key={row.key}
                      row={row}
                      index={item.index}
                      start={start}
                      template={template}
                      measureElement={virtualizer.measureElement}
                      onCreate={handleCreateInGroup}
                    />
                  );
                }
                return (
                  <TableRow
                    key={row.key}
                    database={database}
                    record={row.record}
                    columns={columns}
                    template={template}
                    index={item.index}
                    start={start}
                    wrap={layout.wrap}
                    height={layout.height}
                    autoFit={layout.autoFit}
                    readOnly={readOnly}
                    draggable={draggable}
                    isSelected={selectedIds.includes(row.record.id)}
                    activeFieldId={
                      active?.recordId === row.record.id
                        ? active.fieldId
                        : undefined
                    }
                    isEditing={editing && active?.recordId === row.record.id}
                    editInput={
                      editing && active?.recordId === row.record.id
                        ? editInput
                        : undefined
                    }
                    dropSide={
                      drop?.recordId === row.record.id ? drop.side : undefined
                    }
                    measureElement={virtualizer.measureElement}
                    onToggleSelected={handleToggleSelected}
                    onActivate={handleActivate}
                    onChange={handleChange}
                    onChangeFields={handleChangeFields}
                    onCloseEditor={handleCloseEditor}
                    onOpenRecord={handleOpenRecord}
                  />
                );
              })}
            </Body>
            <DragOverlay dropAnimation={null}>
              {draggedRecord && primary ? (
                <DragGhost>
                  {cellValueToText(primary, draggedRecord.fields[primary.id]) ||
                    t("Untitled")}
                  {selectedIds.length > 1 &&
                  selectedIds.includes(draggedRecord.id)
                    ? ` +${selectedIds.length - 1}`
                    : ""}
                </DragGhost>
              ) : null}
            </DragOverlay>
          </DndContext>

          {!query.isLoaded && query.isLoading && (
            <LoadingRows template={template} columns={columns.length} />
          )}
          {query.error && !query.isLoading && (
            <SpanningLine $template={template}>
              <SpanningContent>
                <ErrorText>{t("The rows could not be loaded.")}</ErrorText>
                <NewButton type="button" onClick={() => void query.refresh()}>
                  {t("Retry")}
                </NewButton>
              </SpanningContent>
            </SpanningLine>
          )}
          {!grouped && canCreate && (
            <SpanningLine $template={template}>
              <SpanningContent>
                <NewButton type="button" onClick={() => void handleCreate()}>
                  <PlusIcon size={18} />
                  {t("New")}
                </NewButton>
              </SpanningContent>
            </SpanningLine>
          )}
          <TableFooter
            database={database}
            view={view}
            columns={columns}
            template={template}
            readOnly={readOnly}
            results={results}
          />
        </Grid>
      </Scroller>
    </Wrapper>
  );
});

function LoadingRows({
  template,
  columns,
}: {
  template: string;
  columns: number;
}) {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <SpanningLine key={row} $template={template}>
          <span />
          {Array.from({ length: columns }, (_, col) => (
            <LoadingCell key={col}>
              <PlaceholderText minWidth={30} maxWidth={80} />
            </LoadingCell>
          ))}
        </SpanningLine>
      ))}
    </>
  );
}

function isTypedCharacter(event: React.KeyboardEvent): boolean {
  // AltGr reports Ctrl+Alt on Windows and types characters such as « @ ».
  return (
    event.key.length === 1 && !event.metaKey && (!event.ctrlKey || event.altKey)
  );
}

function combineFilters(
  ...filters: (DatabaseFilter | null | undefined)[]
): DatabaseFilter | undefined {
  const present = filters.filter(
    (filter): filter is DatabaseFilter => !!filter
  );
  if (present.length <= 1) {
    return present[0];
  }
  return { conjunction: "and", filterSet: present };
}

const Wrapper = styled.div`
  position: relative;
`;

const DragGhost = styled.div`
  display: inline-block;
  max-width: 320px;
  padding: 6px 10px;
  border-radius: 4px;
  background: ${s("menuBackground")};
  box-shadow: ${s("menuShadow")};
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: grabbing;
`;

const ErrorText = styled.span`
  color: ${s("textSecondary")};
`;

const LoadingCell = styled.div`
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
`;

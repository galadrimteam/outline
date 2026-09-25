import type {
  Active,
  Announcements,
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DropAnimation,
  Over,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { observer } from "mobx-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseRecordOrder,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import useStores from "~/hooks/useStores";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import {
  EMPTY_STACK,
  boardColumns,
  buildLanes,
  cardFields,
  containerKey,
  parseContainerKey,
  cellTitle,
  dropOrder,
  isManualOrder,
  isStackable,
  moveStack,
  stackFilter,
  stackValue,
  toggleStack,
} from "../../boardModel";
import { groupPrefill } from "../../toolbar/grouping";
import type { DatabaseViewProps } from "../../types";
import { CardOverlay } from "./BoardCard";
import { BoardColumn, columnDndId, columnWidths } from "./BoardColumn";
import { BoardLanes } from "./BoardLanes";
import { BoardSetup } from "./BoardSetup";
import { HiddenGroups } from "./HiddenGroups";
import { NewGroup } from "./NewGroup";

/** Cards loaded per column and per « Load more ». */
const PAGE_SIZE = 50;

/**
 * Notion's board: one column per option of a select property, cards dragged
 * between and within columns, columns reordered, folded and added.
 */
export const BoardView = observer(function BoardView(props: DatabaseViewProps) {
  const { database, view, readOnly } = props;
  const field = view.options.stackFieldId
    ? database.fieldById(view.options.stackFieldId)
    : undefined;

  if (!field || !isStackable(field)) {
    return <BoardSetup database={database} view={view} readOnly={readOnly} />;
  }
  return <Board {...props} field={field} />;
});

type Items = Record<string, string[]>;

interface DragState {
  type: "card" | "column";
  activeId: string;
  /** Card ids per container while a card is dragged. */
  items?: Items;
  /** Where the card was picked up. */
  origin?: { container: string; index: number };
}

const Board = observer(function Board({
  database,
  view,
  query,
  readOnly,
  onOpenRecord,
  field,
}: DatabaseViewProps & { field: DatabaseField }) {
  const { t } = useTranslation();
  const { databases, databaseRecords } = useStores();
  const { visible, hidden } = boardColumns(field, view);
  const columnKeys = [...visible, ...hidden].map((column) => column.key);
  const columnsSignature = columnKeys.join("\u0000");
  const manual = isManualOrder(view, query.params.sort);
  const fields = cardFields(database.fields ?? [], view);
  const subGroupFieldId = view.overrides.subGroupFieldId;
  const subField =
    subGroupFieldId && subGroupFieldId !== field.id
      ? database.fieldById(subGroupFieldId)
      : undefined;
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const justDraggedRef = React.useRef(false);

  const queries = React.useMemo(() => {
    const { filter, replaceFilter, sort, search } = query.params;
    return new Map<string, RecordQuery>(
      columnsSignature.split("\u0000").map((key) => [
        key,
        databaseRecords.query(database.id, view.id, {
          filter,
          replaceFilter,
          sort,
          search,
          extraFilter: stackFilter(field.id, key),
          pageSize: PAGE_SIZE,
        }),
      ])
    );
  }, [
    databaseRecords,
    database.id,
    view.id,
    field.id,
    columnsSignature,
    query,
  ]);

  React.useEffect(() => {
    queries.forEach((columnQuery) => void columnQuery.fetch());
  }, [queries]);

  const lanes = subField
    ? buildLanes(
        subField,
        visible.map((column) => ({
          key: column.key,
          recordIds: queries.get(column.key)?.recordIds ?? [],
        })),
        (id) => databaseRecords.recordById(database.id, id)
      )
    : undefined;

  const baseItems = (): Items => {
    if (lanes) {
      const items: Items = {};
      for (const lane of lanes) {
        for (const column of visible) {
          items[containerKey(lane.key, column.key)] = [
            ...(lane.cards[column.key] ?? []),
          ];
        }
      }
      return items;
    }
    return Object.fromEntries(
      columnKeys.map((key) => [key, [...(queries.get(key)?.recordIds ?? [])]])
    );
  };

  const idsFor = (container: string) =>
    drag?.items?.[container] ??
    (lanes
      ? (lanes.find((lane) => lane.key === parseContainerKey(container).lane)
          ?.cards[parseContainerKey(container).column] ?? [])
      : (queries.get(container)?.recordIds ?? []));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    if (dragType(args.active) === "column") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => container.data.current?.type === "column"
        ),
      });
    }

    const candidates = args.droppableContainers.filter((container) => {
      const type = container.data.current?.type;
      return type === "card" || type === "column-body";
    });
    const within = pointerWithin({ ...args, droppableContainers: candidates });
    const typeOf = (id: UniqueIdentifier) =>
      candidates.find((container) => container.id === id)?.data.current?.type;

    const card = within.find((collision) => typeOf(collision.id) === "card");
    if (card) {
      return [card];
    }

    const body = within[0];
    if (body) {
      const key = containerOfId(body.id);
      const cards = candidates.filter(
        (container) =>
          container.data.current?.type === "card" &&
          container.data.current?.container === key
      );
      return cards.length
        ? closestCenter({ ...args, droppableContainers: cards })
        : [body];
    }

    return closestCorners({ ...args, droppableContainers: candidates });
  }, []);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeId = String(active.id);
    if (dragType(active) === "column") {
      setDrag({ type: "column", activeId });
      return;
    }

    const items = baseItems();
    const container = findContainer(activeId, items);
    if (container === undefined) {
      return;
    }
    setDrag({
      type: "card",
      activeId,
      items,
      origin: { container, index: items[container].indexOf(activeId) },
    });
  };

  const handleDragOver = React.useCallback(
    ({ active, over }: DragOverEvent) => {
      if (!over || dragType(active) !== "card") {
        return;
      }
      setDrag((current) => {
        if (!current?.items) {
          return current;
        }
        const items = moveAcrossContainers(current.items, active, over);
        return items === current.items ? current : { ...current, items };
      });
    },
    []
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    justDraggedRef.current = true;
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 0);

    const current = drag;
    setDrag(null);
    if (!current || !over) {
      return;
    }

    if (current.type === "column") {
      const from = containerOfId(active.id);
      const to = columnKeyOf(over);
      if (from === undefined || to === undefined || from === to) {
        return;
      }
      databases
        .updateView(database.id, view.id, {
          overrides: { stackOrder: moveStack(columnKeys, from, to) },
        })
        .catch(() => toast.error(t("Couldn’t move the group")));
      return;
    }

    const { items, origin } = current;
    if (!items || !origin) {
      return;
    }
    const recordId = current.activeId;
    const container = findContainer(recordId, items);
    if (container === undefined) {
      return;
    }

    let ids = items[container];
    if (findContainer(String(over.id), items) === container) {
      const from = ids.indexOf(recordId);
      const to =
        over.data.current?.type === "card"
          ? ids.indexOf(String(over.id))
          : ids.length - 1;
      if (to !== -1 && from !== to) {
        ids = arrayMove(ids, from, to);
      }
    }

    const index = ids.indexOf(recordId);
    if (container === origin.container && index === origin.index) {
      return;
    }
    if (container === origin.container && !manual) {
      toast.message(
        t("This view is sorted, remove the sort to order cards by hand")
      );
      return;
    }

    const values = containerValues(container, origin.container);
    if (!values) {
      toast.error(t("This card cannot be moved to this group"));
      return;
    }

    const order = manual
      ? dropOrder(
          ids.filter((id) => id !== recordId),
          index
        )
      : {};
    databaseRecords
      .move(database.id, view.id, {
        recordIds: [recordId],
        ...order,
        fields: Object.keys(values).length ? values : undefined,
      })
      .then(() => {
        if (!manual) {
          databaseRecords.invalidate(database.id, view.id);
        }
      })
      .catch(() => toast.error(t("Couldn’t move the card")));
  };

  /**
   * The cells a card takes when it lands in a container: the column's option
   * and, on a sub-grouped board, the lane's value. Undefined when the lane's
   * property cannot be written.
   */
  const containerValues = (
    target: string,
    source?: string
  ): Record<string, DatabaseCellInput> | undefined => {
    const to = parseContainerKey(target);
    const from = source ? parseContainerKey(source) : undefined;
    const values: Record<string, DatabaseCellInput> = {};
    if (!from || from.column !== to.column) {
      values[field.id] = stackValue(to.column);
    }
    if (subField && to.lane !== undefined && (!from || from.lane !== to.lane)) {
      if (subField.isComputed || subField.isLookup) {
        return from ? undefined : values;
      }
      const lane = lanes?.find((item) => item.key === to.lane);
      const value =
        to.lane === "" || !lane ? null : groupPrefill(subField, lane);
      if (value === undefined) {
        return from ? undefined : values;
      }
      values[subField.id] = value;
    }
    return values;
  };

  const handleDragCancel = React.useCallback(() => setDrag(null), []);

  const handleOpen = React.useCallback(
    (recordId: string) => {
      if (!justDraggedRef.current) {
        onOpenRecord(recordId);
      }
    },
    [onOpenRecord]
  );

  const handleToggleGroup = React.useCallback(
    (key: string) => {
      databases
        .updateView(database.id, view.id, {
          overrides: {
            hiddenStacks: toggleStack(view.overrides.hiddenStacks, key),
          },
        })
        .catch(() => toast.error(t("Couldn’t update the view")));
    },
    [databases, database.id, view.id, view.overrides.hiddenStacks, t]
  );

  const handleCreate = async (
    container: string,
    title: string,
    at: "top" | "bottom"
  ) => {
    const values = containerValues(container) ?? {};
    const primary = database.primaryField;
    if (primary && !primary.isComputed && title) {
      values[primary.id] = title;
    }
    const ids = idsFor(container);
    const anchorId = at === "top" ? ids[0] : ids[ids.length - 1];
    const order: DatabaseRecordOrder | undefined =
      manual && anchorId
        ? {
            viewId: view.id,
            anchorId,
            position: at === "top" ? "before" : "after",
          }
        : undefined;
    try {
      await databaseRecords.create(database.id, values, order);
    } catch (_err) {
      toast.error(t("Couldn’t create the card"));
    }
  };

  const nameOfColumn = (key: string | undefined) =>
    key === EMPTY_STACK
      ? t("No {{ name }}", { name: field.name })
      : (key ?? "");

  const nameOf = (active: Active) => {
    if (dragType(active) === "column") {
      return nameOfColumn(containerOfId(active.id));
    }
    const record = databaseRecords.recordById(database.id, String(active.id));
    const primary = database.primaryField;
    return (
      cellTitle(primary && record ? record.fields[primary.id] : undefined) ||
      t("Untitled")
    );
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("Picked up {{ name }}.", { name: nameOf(active) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("{{ name }} is over {{ target }}.", {
            name: nameOf(active),
            target: nameOfColumn(columnKeyOf(over)),
          })
        : t("{{ name }} is no longer over a group.", {
            name: nameOf(active),
          }),
    onDragEnd: ({ active, over }) =>
      over
        ? t("{{ name }} was dropped in {{ target }}.", {
            name: nameOf(active),
            target: nameOfColumn(columnKeyOf(over)),
          })
        : t("{{ name }} was dropped.", { name: nameOf(active) }),
    onDragCancel: ({ active }) =>
      t("Moving {{ name }} was cancelled.", { name: nameOf(active) }),
  };

  const width = columnWidths[view.overrides.cardSize ?? "medium"];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: t(
            "To move a card or a group, press space, move it with the arrow keys and press space again to drop it, or escape to cancel. Press enter to open a card."
          ),
        },
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Scroller>
        <Lane>
          {lanes && subField ? (
            <BoardLanes
              database={database}
              view={view}
              field={field}
              subField={subField}
              lanes={lanes}
              columns={visible}
              queries={queries}
              idsFor={idsFor}
              cardFields={fields}
              readOnly={readOnly}
              onOpen={handleOpen}
              onHide={handleToggleGroup}
              onCreate={handleCreate}
            />
          ) : (
            <SortableContext
              items={visible.map((column) => columnDndId(column.key))}
              strategy={horizontalListSortingStrategy}
            >
              {visible.map((column) => {
                const columnQuery = queries.get(column.key);
                if (!columnQuery) {
                  return null;
                }
                return (
                  <BoardColumn
                    key={column.key}
                    database={database}
                    view={view}
                    field={field}
                    column={column}
                    query={columnQuery}
                    cardIds={idsFor(column.key)}
                    cardFields={fields}
                    readOnly={readOnly}
                    onOpen={handleOpen}
                    onHide={handleToggleGroup}
                    onCreate={handleCreate}
                  />
                );
              })}
            </SortableContext>
          )}
          {hidden.length > 0 && (
            <HiddenGroups
              field={field}
              columns={hidden}
              queries={queries}
              readOnly={readOnly}
              onShow={handleToggleGroup}
            />
          )}
          {!readOnly && <NewGroup database={database} field={field} />}
        </Lane>
      </Scroller>
      {createPortal(
        <DragOverlay dropAnimation={dropAnimation}>
          {drag?.type === "card" ? (
            <OverlayWidth style={{ width }}>
              <CardOverlay
                database={database}
                view={view}
                recordId={drag.activeId}
                fields={fields}
              />
            </OverlayWidth>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
});

const dropAnimation: DropAnimation = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

function dragType(active: Active): string | undefined {
  const type = active.data.current?.type;
  return typeof type === "string" ? type : undefined;
}

/** The column or container of a column or container dnd id. */
function containerOfId(id: UniqueIdentifier): string | undefined {
  const value = String(id);
  for (const prefix of ["column:", "body:"]) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return undefined;
}

/** The column a droppable belongs to. */
function columnKeyOf(over: Over): string | undefined {
  const { columnKey, container } = over.data.current ?? {};
  if (typeof columnKey === "string") {
    return columnKey;
  }
  if (typeof container === "string") {
    return parseContainerKey(container).column;
  }
  const key = containerOfId(over.id);
  return key === undefined ? undefined : parseContainerKey(key).column;
}

function findContainer(id: string, items: Items): string | undefined {
  const key = containerOfId(id);
  if (key !== undefined) {
    return key;
  }
  return Object.keys(items).find((container) => items[container].includes(id));
}

/**
 * Moves the dragged card into the container under the pointer, above or
 * below the card it is over. Moves within a container are left to the
 * sortable strategy until the drop.
 */
function moveAcrossContainers(items: Items, active: Active, over: Over): Items {
  const activeId = String(active.id);
  const from = findContainer(activeId, items);
  const to = findContainer(String(over.id), items);
  if (from === undefined || to === undefined || from === to || !(to in items)) {
    return items;
  }

  const target = items[to];
  const overIndex = target.indexOf(String(over.id));
  let index = target.length;
  if (overIndex !== -1) {
    const translated = active.rect.current.translated;
    const isBelow =
      !!translated &&
      translated.top + translated.height / 2 >
        over.rect.top + over.rect.height / 2;
    index = overIndex + (isBelow ? 1 : 0);
  }

  return {
    ...items,
    [from]: items[from].filter((id) => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
  };
}

const Scroller = styled.div`
  overflow-x: auto;
  overflow-y: auto;
  max-height: var(--database-view-max-height, none);
  padding-bottom: 12px;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: ${s("scrollbarThumb")} transparent;
`;

const Lane = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: max-content;
  min-height: 120px;
  padding: 2px 2px 8px;
`;

const OverlayWidth = styled.div`
  pointer-events: none;
`;

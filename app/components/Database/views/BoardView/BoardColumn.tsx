import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import { HiddenIcon, MoreIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css, useTheme } from "styled-components";
import type {
  DatabaseCardSize,
  DatabaseField,
  DatabaseView,
} from "@shared/databases/types";
import { s, hover } from "@shared/styles";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import Tooltip from "~/components/Tooltip";
import { createAction } from "~/actions";
import { useMenuAction } from "~/hooks/useMenuAction";
import type Database from "~/models/Database";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import type { BoardColumn as BoardColumnModel } from "../../boardModel";
import { EMPTY_STACK } from "../../boardModel";
import { toneColors } from "../../colors";
import { SortableCard, StaticCard } from "./BoardCard";
import { NewCardForm } from "./NewCardForm";

/** Drag data of a column header. */
export interface ColumnDragData {
  type: "column";
  columnKey: string;
}

/** Drop data of a card container, to drop below the last card or in an empty one. */
export interface ContainerDropData {
  type: "column-body";
  container: string;
}

/** Width of a column per card size, close to Notion's. */
export const columnWidths: Record<DatabaseCardSize, number> = {
  small: 220,
  medium: 260,
  large: 320,
};

/**
 * The dnd id of a column.
 *
 * @param key the column key.
 * @returns the id.
 */
export function columnDndId(key: string): string {
  return `column:${key}`;
}

/**
 * The dnd id of a card container.
 *
 * @param container the container key.
 * @returns the id.
 */
export function containerDndId(container: string): string {
  return `body:${container}`;
}

type Sortable = ReturnType<typeof useSortable>;

/**
 * Makes a column draggable to reorder the board's columns.
 *
 * @param columnKey the column key.
 * @param readOnly whether the reader may only look.
 * @returns the sortable state of the column.
 */
export function useColumnSortable(columnKey: string, readOnly: boolean) {
  const data: ColumnDragData = { type: "column", columnKey };
  return useSortable({
    id: columnDndId(columnKey),
    data,
    disabled: readOnly,
  });
}

interface HeaderProps {
  field: DatabaseField;
  column: BoardColumnModel;
  /** The number of cards, undefined until loaded. */
  count: number | undefined;
  readOnly: boolean;
  /** The drag handle of the column. */
  sortable: Sortable;
  onHide: (key: string) => void;
  /** Starts typing a new card at the top; absent where there is no single top. */
  onAddTop?: () => void;
}

/**
 * A column header: the option as a coloured chip, the count, and on hover the
 * group menu and « + ». Dragging it reorders the columns.
 */
export const ColumnHeader = observer(function ColumnHeader({
  field,
  column,
  count,
  readOnly,
  sortable,
  onHide,
  onAddTop,
}: HeaderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tone = toneColors(column.color, theme);
  const name = columnName(column.key, field, t);

  const menuAction = useMenuAction([
    createAction({
      name: t("Hide group"),
      section: "Database",
      icon: <HiddenIcon />,
      perform: () => onHide(column.key),
    }),
  ]);

  return (
    <Header
      ref={sortable.setActivatorNodeRef}
      $tint={tone.column}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-roledescription={t("Column")}
      aria-label={name}
      tabIndex={readOnly ? -1 : 0}
    >
      <Chip
        style={{ background: tone.background, color: tone.text }}
        $empty={column.key === EMPTY_STACK}
      >
        <Dot style={{ background: tone.dot }} />
        <ChipLabel>{name}</ChipLabel>
      </Chip>
      <Count>{count ?? ""}</Count>
      {!readOnly && (
        <HeaderActions
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onTouchStart={stopPropagation}
          onKeyDown={stopPropagation}
        >
          <DropdownMenu action={menuAction} ariaLabel={t("Group options")}>
            <IconButton aria-label={t("Group options")}>
              <MoreIcon size={18} />
            </IconButton>
          </DropdownMenu>
          {onAddTop && (
            <Tooltip content={t("New card")}>
              <IconButton aria-label={t("New card")} onClick={onAddTop}>
                <PlusIcon size={18} />
              </IconButton>
            </Tooltip>
          )}
        </HeaderActions>
      )}
    </Header>
  );
});

interface CardListProps {
  database: Database;
  view: DatabaseView;
  container: string;
  /** The draggable cards, which differ from the store's while a card is dragged. */
  cardIds: string[];
  /** Cards only shown here, see `BoardLane.copies`. */
  copyIds?: string[];
  cardFields: DatabaseField[];
  readOnly: boolean;
  adding: "top" | "bottom" | null;
  onAdding: (at: "top" | "bottom" | null) => void;
  onOpen: (recordId: string) => void;
  onCreate: (title: string, at: "top" | "bottom") => Promise<void>;
  /** Drawn under the cards, eg « Load more ». */
  footer?: React.ReactNode;
}

/**
 * The cards of a column, or of a column within a lane, with « + New ».
 */
export const CardList = observer(function CardList({
  database,
  view,
  container,
  cardIds,
  copyIds,
  cardFields,
  readOnly,
  adding,
  onAdding,
  onOpen,
  onCreate,
  footer,
}: CardListProps) {
  const { t } = useTranslation();
  const data: ContainerDropData = { type: "column-body", container };
  const { setNodeRef } = useDroppable({ id: containerDndId(container), data });

  const handleClose = React.useCallback(() => onAdding(null), [onAdding]);
  const handleAddBottom = React.useCallback(
    () => onAdding("bottom"),
    [onAdding]
  );
  const handleSubmitTop = React.useCallback(
    (title: string) => onCreate(title, "top"),
    [onCreate]
  );
  const handleSubmitBottom = React.useCallback(
    (title: string) => onCreate(title, "bottom"),
    [onCreate]
  );

  return (
    <Cards ref={setNodeRef}>
      {adding === "top" && (
        <NewCardForm onSubmit={handleSubmitTop} onClose={handleClose} />
      )}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        {cardIds.map((recordId) => (
          <SortableCard
            key={recordId}
            database={database}
            view={view}
            recordId={recordId}
            container={container}
            fields={cardFields}
            readOnly={readOnly}
            onOpen={onOpen}
          />
        ))}
      </SortableContext>
      {copyIds?.map((recordId) => (
        <StaticCard
          key={`copy-${recordId}`}
          database={database}
          view={view}
          recordId={recordId}
          fields={cardFields}
          onOpen={onOpen}
        />
      ))}
      {footer}
      {adding === "bottom" ? (
        <NewCardForm onSubmit={handleSubmitBottom} onClose={handleClose} />
      ) : (
        !readOnly && (
          <ColumnButton onClick={handleAddBottom}>
            <PlusIcon size={18} />
            {t("New")}
          </ColumnButton>
        )
      )}
    </Cards>
  );
});

interface ColumnProps {
  database: Database;
  view: DatabaseView;
  field: DatabaseField;
  column: BoardColumnModel;
  query: RecordQuery;
  cardIds: string[];
  cardFields: DatabaseField[];
  readOnly: boolean;
  onOpen: (recordId: string) => void;
  onHide: (key: string) => void;
  onCreate: (
    container: string,
    title: string,
    at: "top" | "bottom"
  ) => Promise<void>;
}

/**
 * One column of a board without sub-groups: the header, the cards, « Load
 * more » and « + New », moved as a whole when the columns are reordered.
 */
export const BoardColumn = observer(function BoardColumn({
  database,
  view,
  field,
  column,
  query,
  cardIds,
  cardFields,
  readOnly,
  onOpen,
  onHide,
  onCreate,
}: ColumnProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tone = toneColors(column.color, theme);
  const [adding, setAdding] = React.useState<"top" | "bottom" | null>(null);
  const sortable = useColumnSortable(column.key, readOnly);
  const name = columnName(column.key, field, t);

  const handleAddTop = React.useCallback(() => setAdding("top"), []);
  const handleCreate = React.useCallback(
    (title: string, at: "top" | "bottom") => onCreate(column.key, title, at),
    [onCreate, column.key]
  );

  return (
    <Column
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      $width={columnWidths[view.overrides.cardSize ?? "medium"]}
      $tint={tone.column}
      $isDragging={sortable.isDragging}
      role="group"
      aria-label={t("{{ name }}, {{ count }} cards", {
        name,
        count: query.total,
      })}
    >
      <ColumnHeader
        field={field}
        column={column}
        count={query.isLoaded ? query.total : undefined}
        readOnly={readOnly}
        sortable={sortable}
        onHide={onHide}
        onAddTop={readOnly ? undefined : handleAddTop}
      />
      <CardList
        database={database}
        view={view}
        container={column.key}
        cardIds={cardIds}
        cardFields={cardFields}
        readOnly={readOnly}
        adding={adding}
        onAdding={setAdding}
        onOpen={onOpen}
        onCreate={handleCreate}
        footer={<QueryFooter query={query} />}
      />
    </Column>
  );
});

/**
 * The header of a column on a board with sub-groups, alone in the top row.
 */
export const LaneColumnHeader = observer(function LaneColumnHeader({
  view,
  field,
  column,
  query,
  readOnly,
  onHide,
}: Pick<
  ColumnProps,
  "view" | "field" | "column" | "query" | "readOnly" | "onHide"
>) {
  const theme = useTheme();
  const tone = toneColors(column.color, theme);
  const sortable = useColumnSortable(column.key, readOnly);

  return (
    <HeaderCell
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      $width={columnWidths[view.overrides.cardSize ?? "medium"]}
      $tint={tone.column}
      $isDragging={sortable.isDragging}
    >
      <ColumnHeader
        field={field}
        column={column}
        count={query.isLoaded ? query.total : undefined}
        readOnly={readOnly}
        sortable={sortable}
        onHide={onHide}
      />
    </HeaderCell>
  );
});

interface LaneCellProps {
  database: Database;
  view: DatabaseView;
  column: BoardColumnModel;
  container: string;
  cardIds: string[];
  copyIds?: string[];
  cardFields: DatabaseField[];
  readOnly: boolean;
  onOpen: (recordId: string) => void;
  onCreate: (
    container: string,
    title: string,
    at: "top" | "bottom"
  ) => Promise<void>;
}

/**
 * The cards of one column within one lane of a sub-grouped board.
 */
export const LaneCell = observer(function LaneCell({
  database,
  view,
  column,
  container,
  cardIds,
  copyIds,
  cardFields,
  readOnly,
  onOpen,
  onCreate,
}: LaneCellProps) {
  const theme = useTheme();
  const tone = toneColors(column.color, theme);
  const [adding, setAdding] = React.useState<"top" | "bottom" | null>(null);
  const handleCreate = React.useCallback(
    (title: string, at: "top" | "bottom") => onCreate(container, title, at),
    [onCreate, container]
  );

  return (
    <Cell
      $width={columnWidths[view.overrides.cardSize ?? "medium"]}
      $tint={tone.column}
    >
      <CardList
        database={database}
        view={view}
        container={container}
        cardIds={cardIds}
        copyIds={copyIds}
        cardFields={cardFields}
        readOnly={readOnly}
        adding={adding}
        onAdding={setAdding}
        onOpen={onOpen}
        onCreate={handleCreate}
      />
    </Cell>
  );
});

/**
 * Loading, error and « Load more » of a column's query.
 */
export const QueryFooter = observer(function QueryFooter({
  query,
}: {
  query: RecordQuery;
}) {
  const { t } = useTranslation();
  const handleLoadMore = React.useCallback(() => {
    void query.loadMore();
  }, [query]);
  const remaining = query.total - query.recordIds.length;

  return (
    <>
      {!query.isLoaded && query.isLoading && (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}
      {query.error && !query.isLoading && (
        <ColumnButton onClick={handleLoadMore}>
          {t("Couldn’t load the cards, retry")}
        </ColumnButton>
      )}
      {query.hasMore && remaining > 0 && (
        <ColumnButton onClick={handleLoadMore} disabled={query.isLoading}>
          {t("Load {{ count }} more", { count: Math.min(remaining, 50) })}
        </ColumnButton>
      )}
    </>
  );
});

function columnName(
  key: string,
  field: DatabaseField,
  t: (key: string, options?: Record<string, string>) => string
): string {
  return key === EMPTY_STACK ? t("No {{ name }}", { name: field.name }) : key;
}

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 100ms ease-in-out;

  &:focus-within,
  &:has([data-state="open"]) {
    opacity: 1;
  }
`;

const Column = styled.section<{
  $width: number;
  $tint: string;
  $isDragging: boolean;
}>`
  display: flex;
  flex-direction: column;
  flex: 0 0 ${(props) => props.$width}px;
  width: ${(props) => props.$width}px;
  border-radius: 10px;
  background: ${(props) => props.$tint};
  padding: 0 8px 8px;
  align-self: flex-start;
  position: relative;

  ${(props) =>
    props.$isDragging &&
    css`
      opacity: 0.5;
      z-index: 1;
    `}

  &:${hover} ${HeaderActions} {
    opacity: 1;
  }
`;

const HeaderCell = styled.div<{
  $width: number;
  $tint: string;
  $isDragging: boolean;
}>`
  flex: 0 0 ${(props) => props.$width}px;
  width: ${(props) => props.$width}px;
  padding: 0 8px;
  border-radius: 10px;
  background: ${(props) => props.$tint};
  position: relative;

  ${(props) =>
    props.$isDragging &&
    css`
      opacity: 0.5;
      z-index: 1;
    `}

  &:${hover} ${HeaderActions} {
    opacity: 1;
  }
`;

const Cell = styled.div<{ $width: number; $tint: string }>`
  flex: 0 0 ${(props) => props.$width}px;
  width: ${(props) => props.$width}px;
  padding: 8px;
  border-radius: 10px;
  background: ${(props) => props.$tint};
  align-self: stretch;
`;

const Header = styled.div<{ $tint: string }>`
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 8px 2px 6px;
  cursor: grab;
  outline: none;
  border-radius: 10px 10px 0 0;
  /* Opaque, so that cards scrolling under it do not show, and the column's
     tint is not applied twice. */
  background:
    linear-gradient(${(props) => props.$tint}, ${(props) => props.$tint}),
    ${s("background")};

  &:focus-visible {
    box-shadow: inset 0 0 0 2px ${s("accent")};
  }
`;

const Chip = styled.span<{ $empty: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 70%;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;

  ${(props) =>
    props.$empty &&
    css`
      background: transparent !important;
      color: ${props.theme.textSecondary} !important;
      padding: 0 2px;
    `}
`;

const Dot = styled.span`
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
`;

const ChipLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Count = styled.span`
  color: ${s("textTertiary")};
  font-size: 14px;
  font-variant-numeric: tabular-nums;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: ${s("textTertiary")};
  cursor: var(--pointer);

  &:${hover}, &[data-state="open"] {
    background: ${(props) =>
      props.theme.isDark
        ? "rgba(255, 255, 255, 0.08)"
        : "rgba(55, 53, 47, 0.08)"};
    color: ${s("text")};
  }
`;

const Cards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 48px;
`;

const ColumnButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  height: 32px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textTertiary")};
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: var(--pointer);
  transition: background 100ms ease-in-out;

  &:${hover}:not(:disabled) {
    background: ${(props) =>
      props.theme.isDark
        ? "rgba(255, 255, 255, 0.06)"
        : "rgba(55, 53, 47, 0.06)"};
    color: ${s("textSecondary")};
  }

  &:disabled {
    cursor: default;
  }
`;

const SkeletonCard = styled.div`
  height: 64px;
  border-radius: 8px;
  background: ${(props) =>
    props.theme.isDark
      ? "rgba(255, 255, 255, 0.04)"
      : "rgba(55, 53, 47, 0.04)"};
  animation: database-pulse 1.4s ease-in-out infinite;

  @keyframes database-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;

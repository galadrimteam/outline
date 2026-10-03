import type { DragEndEvent } from "@dnd-kit/core";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DatabaseSortOrder, DatabaseView } from "@shared/databases/types";
import NudeButton from "~/components/NudeButton";
import { SelectionCheckbox } from "~/components/SelectionCheckbox";
import type Database from "~/models/Database";
import { AddFieldButton } from "../../fields/AddFieldButton";
import { FieldHeaderMenu } from "../../fields/FieldHeaderMenu";
import { FieldKindIcon } from "../../fields/FieldKindIcon";
import type { TableColumn } from "./layout";
import { clampColumnWidth } from "./layout";
import {
  Gutter,
  GutterControl,
  HeaderButton,
  HeaderCell,
  HeaderLine,
  ResizeHandle,
} from "./styles";

interface Props {
  database: Database;
  view: DatabaseView;
  columns: TableColumn[];
  template: string;
  readOnly: boolean;
  /** The order the rows are sorted by on a column, if any. */
  sortOrderOf: (fieldId: string) => DatabaseSortOrder | undefined;
  selectedCount: number;
  rowCount: number;
  onToggleAll: () => void;
  /** The column whose menu is open. */
  menuFieldId: string | null;
  onMenuChange: (fieldId: string | null) => void;
  /** A width while the column is being resized. */
  onResize: (fieldId: string, width: number) => void;
  /** The width once the column has been resized. */
  onResizeEnd: (fieldId: string, width: number) => void;
  /** Drops a column on the place of another. */
  onReorder: (fieldId: string, overFieldId: string) => void;
  onFilter?: (fieldId: string) => void;
}

/**
 * The header of the table: select-all checkbox, one header per column (menu, drag to reorder,
 * resize handle) and the "+" that adds a property.
 *
 * @param props the columns and the callbacks.
 * @returns the header line.
 */
export const TableHeader = observer(function TableHeader_({
  database,
  view,
  columns,
  template,
  readOnly,
  sortOrderOf,
  selectedCount,
  rowCount,
  onToggleAll,
  menuFieldId,
  onMenuChange,
  onResize,
  onResizeEnd,
  onReorder,
  onFilter,
}: Props) {
  const { t } = useTranslation();
  const canEditView = !readOnly && !view.isLocked;
  const draggedAt = React.useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      draggedAt.current = Date.now();
      if (over && active.id !== over.id) {
        onReorder(String(active.id), String(over.id));
      }
    },
    [onReorder]
  );

  const handleMenuChange = React.useCallback(
    (fieldId: string, open: boolean) => {
      // A drop ends with a click on the header that was dragged; it must not open its menu.
      if (open && Date.now() - draggedAt.current < 250) {
        return;
      }
      onMenuChange(open ? fieldId : null);
    },
    [onMenuChange]
  );

  return (
    <HeaderLine role="row" $template={template}>
      <Gutter role="presentation">
        {!readOnly && selectedCount > 0 && (
          <GutterControl $visible data-gutter-control>
            <SelectionCheckbox
              checked={selectedCount > 0 && selectedCount === rowCount}
              indeterminate={selectedCount > 0 && selectedCount < rowCount}
              label={t("Select all")}
              onClick={onToggleAll}
            />
          </GutterControl>
        )}
      </Gutter>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={columns.map((column) => column.field.id)}
          strategy={horizontalListSortingStrategy}
        >
          {columns.map((column) => (
            <HeaderColumn
              key={column.field.id}
              database={database}
              view={view}
              column={column}
              readOnly={readOnly}
              sortable={canEditView}
              resizable={canEditView}
              sortOrder={sortOrderOf(column.field.id)}
              menuOpen={menuFieldId === column.field.id}
              onMenuChange={handleMenuChange}
              onInserted={(fieldId) => onMenuChange(fieldId)}
              onResize={onResize}
              onResizeEnd={onResizeEnd}
              onFilter={onFilter}
            />
          ))}
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <AddCell>
          <AddFieldButton
            database={database}
            view={view}
            tooltip={t("Add a property")}
          >
            <NudeButton aria-label={t("Add a property")} size={28}>
              <PlusIcon size={20} />
            </NudeButton>
          </AddFieldButton>
        </AddCell>
      )}
    </HeaderLine>
  );
});

interface ColumnProps {
  database: Database;
  view: DatabaseView;
  column: TableColumn;
  readOnly: boolean;
  sortable: boolean;
  resizable: boolean;
  sortOrder?: DatabaseSortOrder;
  menuOpen: boolean;
  onMenuChange: (fieldId: string, open: boolean) => void;
  onInserted: (fieldId: string) => void;
  onResize: (fieldId: string, width: number) => void;
  onResizeEnd: (fieldId: string, width: number) => void;
  onFilter?: (fieldId: string) => void;
}

const HeaderColumn = observer(function HeaderColumn_({
  database,
  view,
  column,
  readOnly,
  sortable,
  resizable,
  sortOrder,
  menuOpen,
  onMenuChange,
  onInserted,
  onResize,
  onResizeEnd,
  onFilter,
}: ColumnProps) {
  const { field } = column;
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: field.id, disabled: !sortable });
  const [resizing, setResizing] = React.useState(false);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = column.width;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      setResizing(true);
      let width = startWidth;

      const handleMove = (moveEvent: PointerEvent) => {
        width = clampColumnWidth(startWidth + moveEvent.clientX - startX);
        onResize(field.id, width);
      };
      const handleUp = () => {
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleUp);
        target.removeEventListener("pointercancel", handleUp);
        setResizing(false);
        onResizeEnd(field.id, width);
      };
      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleUp);
      target.addEventListener("pointercancel", handleUp);
    },
    [column.width, field.id, onResize, onResizeEnd]
  );

  return (
    <HeaderCell
      ref={setNodeRef}
      role="columnheader"
      aria-sort={
        sortOrder === "asc"
          ? "ascending"
          : sortOrder === "desc"
            ? "descending"
            : undefined
      }
      $frozen={column.frozen}
      $left={column.left}
      style={{
        transform: transform ? `translateX(${transform.x}px)` : undefined,
        zIndex: isDragging ? 4 : undefined,
      }}
    >
      <FieldHeaderMenu
        database={database}
        view={view}
        field={field}
        readOnly={readOnly}
        open={menuOpen}
        onOpenChange={(open) => onMenuChange(field.id, open)}
        onFilter={onFilter}
        onInserted={onInserted}
      >
        <HeaderButton type="button" {...attributes} {...listeners}>
          <FieldKindIcon field={field} size={16} />
          <HeaderName>{field.name}</HeaderName>
        </HeaderButton>
      </FieldHeaderMenu>
      {resizable && (
        <ResizeHandle
          role="separator"
          aria-orientation="vertical"
          $active={resizing}
          onPointerDown={handlePointerDown}
        />
      )}
    </HeaderCell>
  );
});

const HeaderName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AddCell = styled.div`
  display: flex;
  align-items: center;
  padding-left: 4px;
`;

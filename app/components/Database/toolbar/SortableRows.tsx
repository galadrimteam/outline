import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { DragHandle } from "./components";
import { DragHandleIcon } from "./icons";

interface Props {
  /** Row ids, in their current order. */
  ids: string[];
  /** Called with every id in the new order after a drop. */
  onReorder: (ids: string[]) => void;
  /** Draws a row; `handle` is the drag handle to place in it. */
  renderRow: (id: string, handle: React.ReactNode) => React.ReactNode;
  /** Disables dragging. */
  disabled?: boolean;
}

/**
 * A vertical list reordered by dragging a handle, with the mouse or the
 * keyboard (Space to lift, arrows to move, Space to drop).
 *
 * @param props the ids, the reorder callback and the row renderer.
 * @returns the list.
 */
export function SortableRows({ ids, onReorder, renderRow, disabled }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) {
        return;
      }
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from >= 0 && to >= 0) {
        onReorder(arrayMove(ids, from, to));
      }
    },
    [ids, onReorder]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <List>
          {ids.map((id) => (
            <SortableRow key={id} id={id} disabled={disabled}>
              {(handle) => renderRow(id, handle)}
            </SortableRow>
          ))}
        </List>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const handle = disabled ? null : (
    <DragHandle
      type="button"
      ref={setActivatorNodeRef}
      aria-label={t("Drag to reorder")}
      {...attributes}
      {...listeners}
    >
      <DragHandleIcon />
    </DragHandle>
  );

  return (
    <Item
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      $dragging={isDragging}
    >
      {children(handle)}
    </Item>
  );
}

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Item = styled.div<{ $dragging: boolean }>`
  position: relative;
  z-index: ${(props) => (props.$dragging ? 1 : "auto")};
  opacity: ${(props) => (props.$dragging ? 0.8 : 1)};
`;

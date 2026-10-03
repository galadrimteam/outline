import { useDraggable, useDroppable } from "@dnd-kit/core";
import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type {
  DatabaseCellInput,
  DatabaseRecord,
  DatabaseRecordPosition,
} from "@shared/databases/types";
import { SelectionCheckbox } from "~/components/SelectionCheckbox";
import type Database from "~/models/Database";
import { DragHandleIcon } from "../../toolbar/icons";
import type { TableColumn } from "./layout";
import { frozenEdge } from "./layout";
import { Gutter, GutterControl, RowLine } from "./styles";
import { ParentLabels, SubItemToggle } from "./SubItemControls";
import { TableCell } from "./TableCell";

/** How a row shows its place among sub-items. */
export interface RowSubItems {
  /** Nested: the level and the toggle of the row; flattened: the titles of its parents. */
  mode: "nested" | "flattened";
  level: number;
  hasChildren: boolean;
  expanded: boolean;
  parentTitles: string[];
  onToggle: (recordId: string) => void;
}

interface Props {
  database: Database;
  record: DatabaseRecord;
  columns: TableColumn[];
  template: string;
  index: number;
  start: number;
  /** Row height; the minimum height when rows fit their content. */
  height: number;
  autoFit: boolean;
  /** Whether rows can be taller than a line of text. */
  tall: boolean;
  readOnly: boolean;
  /** Whether rows can be dragged to a new place (no sort on the view). */
  draggable: boolean;
  isSelected: boolean;
  /** Whether the row's page is open in the side peek. */
  isPeeked: boolean;
  /** Whether some rows are selected: every row then shows its checkbox. */
  selecting: boolean;
  /** The active column of this row, when the active cell is in it. */
  activeFieldId?: string;
  isEditing: boolean;
  /** What the reader typed on the active cell to start editing it. */
  editInput?: string;
  dropSide?: DatabaseRecordPosition;
  /** Its sub-items, when the table shows some. */
  subItems?: RowSubItems;
  measureElement: (element: Element | null) => void;
  onToggleSelected: (recordId: string, event: React.MouseEvent) => void;
  /** A click on the drag handle, which selects the row as in Notion. */
  onSelectRow: (
    recordId: string,
    event: React.MouseEvent | React.KeyboardEvent
  ) => void;
  /** Adds a row under this one; absent when the reader cannot add rows. */
  onInsertBelow?: (recordId: string) => void;
  onActivate: (recordId: string, fieldId: string, edit: boolean) => void;
  onChange: (
    recordId: string,
    fieldId: string,
    value: DatabaseCellInput
  ) => void;
  onChangeFields: (
    recordId: string,
    fields: Record<string, DatabaseCellInput>
  ) => void;
  onCloseEditor: () => void;
  onOpenRecord: (recordId: string) => void;
}

/**
 * A row of the table: gutter (« + », drag handle, checkbox of a selection) and one cell per
 * column. Rows are drop targets for the rows being dragged.
 *
 * @param props the row, its columns and its state.
 * @returns the row.
 */
export const TableRow = observer(function TableRow_({
  database,
  record,
  columns,
  template,
  index,
  start,
  height,
  autoFit,
  tall,
  readOnly,
  draggable,
  isSelected,
  isPeeked,
  selecting,
  activeFieldId,
  isEditing,
  editInput,
  dropSide,
  subItems,
  measureElement,
  onToggleSelected,
  onSelectRow,
  onInsertBelow,
  onActivate,
  onChange,
  onChangeFields,
  onCloseEditor,
  onOpenRecord,
}: Props) {
  const { t } = useTranslation();
  const drag = useDraggable({
    id: record.id,
    disabled: !draggable || readOnly,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: record.id });
  const scrollMarginLeft = frozenEdge(columns);
  const leading =
    subItems?.mode === "nested" ? (
      <SubItemToggle
        level={subItems.level}
        hasChildren={subItems.hasChildren}
        expanded={subItems.expanded}
        onToggle={() => subItems.onToggle(record.id)}
      />
    ) : undefined;
  const trailing =
    subItems?.mode === "flattened" ? (
      <ParentLabels titles={subItems.parentTitles} />
    ) : undefined;

  const setRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      setDropRef(element);
      measureElement(element);
    },
    [setDropRef, measureElement]
  );

  return (
    <RowLine
      ref={setRef}
      role="row"
      aria-selected={isSelected}
      data-index={index}
      $template={template}
      $selected={isSelected}
      $peeked={isPeeked}
      $dropSide={dropSide}
      style={{
        transform: `translateY(${start}px)`,
        height: autoFit ? undefined : `${height}px`,
        minHeight: `${height}px`,
        opacity: drag.isDragging ? 0.5 : 1,
      }}
    >
      <Gutter role="presentation">
        {selecting && (
          <GutterControl data-gutter-control $visible>
            <SelectionCheckbox
              checked={isSelected}
              label={t("Select")}
              onClick={(event) => onToggleSelected(record.id, event)}
            />
          </GutterControl>
        )}
        {!readOnly && !selecting && onInsertBelow && (
          <GutterControl
            role="button"
            tabIndex={-1}
            data-gutter-control
            aria-label={t("Add a row below")}
            $width={24}
            style={{ cursor: "var(--pointer)" }}
            onClick={(event) => {
              event.stopPropagation();
              onInsertBelow(record.id);
            }}
          >
            <PlusIcon size={20} />
          </GutterControl>
        )}
        {!readOnly && (
          <GutterControl
            ref={drag.setNodeRef}
            data-gutter-control
            {...drag.attributes}
            role="button"
            aria-label={
              draggable ? t("Drag to move, click to select") : t("Select")
            }
            $width={18}
            style={{
              cursor: draggable ? "grab" : "var(--pointer)",
              touchAction: "none",
            }}
            {...drag.listeners}
            onClick={(event) => onSelectRow(record.id, event)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectRow(record.id, event);
              }
            }}
          >
            <DragHandleIcon size={20} />
          </GutterControl>
        )}
      </Gutter>
      {columns.map((column) => (
        <TableCell
          key={column.field.id}
          database={database}
          column={column}
          record={record}
          isActive={activeFieldId === column.field.id}
          isPeeked={isPeeked}
          isEditing={isEditing && activeFieldId === column.field.id}
          initialInput={
            activeFieldId === column.field.id ? editInput : undefined
          }
          scrollMarginLeft={scrollMarginLeft}
          wrap={column.wrap}
          alignTop={tall}
          leading={column.field.isPrimary ? leading : undefined}
          trailing={column.field.isPrimary ? trailing : undefined}
          readOnly={readOnly}
          onActivate={onActivate}
          onChange={onChange}
          onChangeFields={onChangeFields}
          onCloseEditor={onCloseEditor}
          onOpenRecord={onOpenRecord}
        />
      ))}
    </RowLine>
  );
});

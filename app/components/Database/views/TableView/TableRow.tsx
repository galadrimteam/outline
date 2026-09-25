import { useDraggable, useDroppable } from "@dnd-kit/core";
import { observer } from "mobx-react";
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
import { Gutter, GutterControl, RowLine } from "./styles";
import { TableCell } from "./TableCell";

interface Props {
  database: Database;
  record: DatabaseRecord;
  columns: TableColumn[];
  template: string;
  index: number;
  start: number;
  wrap: boolean;
  /** Row height; the minimum height when rows fit their content. */
  height: number;
  autoFit: boolean;
  readOnly: boolean;
  /** Whether rows can be dragged to a new place (no sort on the view). */
  draggable: boolean;
  isSelected: boolean;
  /** The active column of this row, when the active cell is in it. */
  activeFieldId?: string;
  isEditing: boolean;
  dropSide?: DatabaseRecordPosition;
  measureElement: (element: Element | null) => void;
  onToggleSelected: (recordId: string, event: React.MouseEvent) => void;
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
 * A row of the table: gutter (drag handle, checkbox) and one cell per column. Rows are drop
 * targets for the rows being dragged.
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
  wrap,
  height,
  autoFit,
  readOnly,
  draggable,
  isSelected,
  activeFieldId,
  isEditing,
  dropSide,
  measureElement,
  onToggleSelected,
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
      $dropSide={dropSide}
      style={{
        transform: `translateY(${start}px)`,
        height: autoFit ? undefined : `${height}px`,
        minHeight: `${height}px`,
        opacity: drag.isDragging ? 0.5 : 1,
      }}
    >
      <Gutter role="presentation">
        {draggable && !readOnly && (
          <GutterControl
            ref={drag.setNodeRef}
            data-gutter-control
            aria-label={t("Drag to move")}
            style={{ cursor: "grab", touchAction: "none" }}
            {...drag.attributes}
            {...drag.listeners}
          >
            <DragHandleIcon />
          </GutterControl>
        )}
        {!readOnly && (
          <GutterControl data-gutter-control $visible={isSelected}>
            <SelectionCheckbox
              checked={isSelected}
              label={t("Select")}
              onClick={(event) => onToggleSelected(record.id, event)}
            />
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
          isEditing={isEditing && activeFieldId === column.field.id}
          wrap={wrap}
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

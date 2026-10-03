import { observer } from "mobx-react";
import { SidebarIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseRecord,
} from "@shared/databases/types";
import type Database from "~/models/Database";
import { getCell } from "../../cells/registry";
import { CommentCount } from "../../comments/CommentCount";
import { RowIcon } from "../../RowIcon";
import type { TableColumn } from "./layout";
import { Cell, OpenButton } from "./styles";

interface Props {
  database: Database;
  column: TableColumn;
  record: DatabaseRecord;
  isActive: boolean;
  isEditing: boolean;
  /** What the reader typed on the cell to start editing it. */
  initialInput?: string;
  /** Room to keep on the left when the cell is scrolled into view. */
  scrollMarginLeft: number;
  /** Whether the content shows on several lines. */
  wrap: boolean;
  /** Whether rows can be taller than a line: cells then start at the top, like Notion's. */
  alignTop: boolean;
  /** Drawn before the value (the sub-item toggle of a title). */
  leading?: React.ReactNode;
  /** Drawn after the value (the parents of a sub-item). */
  trailing?: React.ReactNode;
  readOnly: boolean;
  /** Makes the cell active, and starts editing it when `edit` is set. */
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
 * One cell of the table: the field's renderer, or its editor while editing. The title cell has
 * the "Open" button of the row's page.
 *
 * @param props the cell, its state and the callbacks.
 * @returns the cell.
 */
export const TableCell = observer(function TableCell_({
  database,
  column,
  record,
  isActive,
  isEditing,
  initialInput,
  scrollMarginLeft,
  wrap,
  alignTop,
  leading,
  trailing,
  readOnly,
  onActivate,
  onChange,
  onChangeFields,
  onCloseEditor,
  onOpenRecord,
}: Props) {
  const { t } = useTranslation();
  const { field } = column;
  const cell = getCell(field.type);
  const editable = !readOnly && !!cell.Editor && cell.isEditable(field);
  const value = record.fields[field.id];

  const handleClick = React.useCallback(() => {
    onActivate(record.id, field.id, editable);
  }, [editable, field.id, onActivate, record.id]);

  const handleChange = React.useCallback(
    (next: DatabaseCellInput) => onChange(record.id, field.id, next),
    [field.id, onChange, record.id]
  );

  const handleChangeFields = React.useCallback(
    (fields: Record<string, DatabaseCellInput>) =>
      onChangeFields(record.id, fields),
    [onChangeFields, record.id]
  );

  const handleOpen = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onOpenRecord(record.id);
    },
    [onOpenRecord, record.id]
  );

  const Editor = cell.Editor;
  const content =
    isEditing && editable && Editor ? (
      <Editor
        field={field}
        value={value}
        database={database}
        variant="table"
        record={record}
        wrap={wrap}
        onChange={handleChange}
        onChangeFields={handleChangeFields}
        onClose={onCloseEditor}
        initialInput={initialInput}
      />
    ) : (
      <cell.Renderer
        field={field}
        value={value}
        database={database}
        variant="table"
        record={record}
        wrap={wrap}
      />
    );

  return (
    <Cell
      role="gridcell"
      aria-selected={isActive}
      data-cell={`${record.id}:${field.id}`}
      $frozen={column.frozen}
      $left={column.left}
      $scrollMarginLeft={column.frozen ? 0 : scrollMarginLeft}
      $active={isActive}
      $top={alignTop}
      $editable={editable}
      $primary={field.isPrimary}
      onClick={handleClick}
    >
      {leading}
      {field.isPrimary && (
        <TitleIcon database={database} record={record} size={18} />
      )}
      {content}
      {!isEditing && trailing}
      {field.isPrimary && !isEditing && (
        <TitleCommentCount
          databaseId={database.id}
          recordId={record.id}
          documentId={record.documentId}
        />
      )}
      {field.isPrimary && !isEditing && (
        <OpenButton
          type="button"
          data-open-button
          aria-label={t("Open page")}
          onClick={handleOpen}
        >
          <SidebarIcon size={16} />
          {t("Open")}
        </OpenButton>
      )}
    </Cell>
  );
});

const TitleIcon = styled(RowIcon)`
  margin-right: 6px;
`;

const TitleCommentCount = styled(CommentCount)`
  flex-shrink: 0;
  margin-left: 5px;
`;

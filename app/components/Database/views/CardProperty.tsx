import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseRecord,
} from "@shared/databases/types";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { getCell } from "../cells/registry";
import type { CellVariant } from "../cells/types";

interface Props {
  database: Database;
  field: DatabaseField;
  record: DatabaseRecord;
  /** Whether the reader may only look: the click then goes to the card. */
  readOnly: boolean;
  /** How the value is drawn. */
  variant: CellVariant;
  /** Drawn before the value, eg the property's name. */
  children?: React.ReactNode;
  className?: string;
  title?: string;
}

/**
 * A property of a card or a list row. As in Notion, a click on it opens the editor of that
 * property alone, anchored on it, instead of the row's page; a property that cannot be edited
 * lets the click through to the card.
 *
 * @param props the property, its row and whether it may be edited.
 * @returns the property.
 */
export const CardProperty = observer(function CardProperty_({
  database,
  field,
  record,
  readOnly,
  variant,
  children,
  className,
  title,
}: Props) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const [editing, setEditing] = React.useState(false);
  const cell = getCell(field.type);
  const Editor = cell.Editor;
  const editable = !readOnly && !!Editor && cell.isEditable(field);
  const value = record.fields[field.id];

  const write = React.useCallback(
    (fields: Record<string, DatabaseCellInput>) => {
      databaseRecords
        .update(database.id, record.id, fields)
        .catch(() => toast.error(t("The change could not be saved")));
    },
    [database.id, databaseRecords, record.id, t]
  );

  const handleChange = React.useCallback(
    (next: DatabaseCellInput) => write({ [field.id]: next }),
    [field.id, write]
  );

  const handleClose = React.useCallback(() => setEditing(false), []);

  const handleClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (!editable) {
        return;
      }
      event.stopPropagation();
      setEditing(true);
    },
    [editable]
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (editing) {
        event.stopPropagation();
        return;
      }
      if (
        editable &&
        event.target === event.currentTarget &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
      }
    },
    [editable, editing]
  );

  // While the editor is open, what happens in it (also in its popover, a React child) must
  // not drag, open or select the card.
  const stopWhileEditing = editing ? stopPropagation : undefined;

  return (
    <Property
      className={className}
      title={title}
      role={editable ? "button" : undefined}
      tabIndex={editable && !editing ? 0 : undefined}
      aria-label={editable ? field.name : undefined}
      $editable={editable}
      onClick={editing ? stopPropagation : handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={stopWhileEditing}
      onMouseDown={stopWhileEditing}
      onTouchStart={stopWhileEditing}
    >
      {children}
      {editing && Editor ? (
        <Editor
          field={field}
          value={value}
          database={database}
          record={record}
          variant={variant}
          onChange={handleChange}
          onChangeFields={write}
          onClose={handleClose}
        />
      ) : (
        <cell.Renderer
          field={field}
          value={value}
          database={database}
          record={record}
          variant={variant}
        />
      )}
    </Property>
  );
});

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

const Property = styled.div<{ $editable: boolean }>`
  min-width: 0;
  outline: none;
  cursor: ${(props) => (props.$editable ? "var(--pointer)" : "inherit")};

  &:focus-visible {
    box-shadow: 0 0 0 2px ${(props) => props.theme.accent};
  }
`;

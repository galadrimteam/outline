import { observer } from "mobx-react";
import * as React from "react";
import styled from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseRecord,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import Tooltip from "~/components/Tooltip";
import type Database from "~/models/Database";
import { getCell } from "../cells/registry";
import { FieldHeaderMenu } from "./FieldHeaderMenu";
import { FieldKindIcon } from "./FieldKindIcon";

interface Props {
  database: Database;
  field: DatabaseField;
  record: DatabaseRecord;
  readOnly: boolean;
  onChange: (fieldId: string, value: DatabaseCellInput) => void;
  onChangeFields: (fields: Record<string, DatabaseCellInput>) => void;
}

/**
 * One property of a row page, Notion-like: icon and name on the left (opening the property
 * menu), the value on the right, edited in place with the cell editor of its type.
 *
 * @param props the property, the row and the write callbacks.
 * @returns the property line.
 */
export const PropertyRow = observer(function PropertyRow_({
  database,
  field,
  record,
  readOnly,
  onChange,
  onChangeFields,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const cell = getCell(field.type);
  const Editor = cell.Editor;
  const editable = !readOnly && !!Editor && cell.isEditable(field);
  const value = record.fields[field.id];

  const handleStartEditing = React.useCallback(() => {
    if (editable) {
      setEditing(true);
    }
  }, [editable]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        !editing &&
        event.target === event.currentTarget &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        handleStartEditing();
      }
    },
    [editing, handleStartEditing]
  );

  const handleClose = React.useCallback(() => setEditing(false), []);

  const handleChange = React.useCallback(
    (next: DatabaseCellInput) => onChange(field.id, next),
    [field.id, onChange]
  );

  const name = (
    <NameButton type="button" disabled={readOnly} aria-label={field.name}>
      <FieldKindIcon field={field} size={16} />
      <Name>{field.name}</Name>
    </NameButton>
  );

  return (
    <Line>
      <NameCell>
        {readOnly ? (
          field.description ? (
            <Tooltip content={field.description} placement="left">
              {name}
            </Tooltip>
          ) : (
            name
          )
        ) : (
          <FieldHeaderMenu
            database={database}
            field={field}
            readOnly={readOnly}
            open={menuOpen}
            onOpenChange={setMenuOpen}
          >
            {name}
          </FieldHeaderMenu>
        )}
      </NameCell>
      <ValueCell
        role={editable ? "button" : undefined}
        tabIndex={editable && !editing ? 0 : undefined}
        $editable={editable}
        $editing={editing}
        onClick={editing ? undefined : handleStartEditing}
        onKeyDown={handleKeyDown}
      >
        {editing && Editor ? (
          <Editor
            field={field}
            value={value}
            database={database}
            record={record}
            variant="property"
            onChange={handleChange}
            onChangeFields={onChangeFields}
            onClose={handleClose}
          />
        ) : (
          <cell.Renderer
            field={field}
            value={value}
            database={database}
            record={record}
            variant="property"
          />
        )}
      </ValueCell>
    </Line>
  );
});

const Line = styled.div`
  display: flex;
  align-items: flex-start;
  min-height: 34px;
  font-size: 14px;
`;

const NameCell = styled.div`
  flex: 0 0 160px;
  width: 160px;
  min-width: 0;
`;

const NameButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  font: inherit;
  color: ${s("textSecondary")};
  text-align: left;
  cursor: var(--pointer);

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }

  &:disabled {
    cursor: default;
  }

  &:hover:not(:disabled),
  &[aria-expanded="true"] {
    background: ${s("listItemHoverBackground")};
  }
`;

const Name = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ValueCell = styled.div<{ $editable: boolean; $editing: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border-radius: 4px;
  outline: none;
  cursor: ${(props) => (props.$editable ? "var(--pointer)" : "default")};
  background: ${(props) =>
    props.$editing ? props.theme.listItemHoverBackground : "transparent"};

  &:hover,
  &:focus-visible {
    background: ${(props) =>
      props.$editable ? props.theme.listItemHoverBackground : "transparent"};
  }
`;

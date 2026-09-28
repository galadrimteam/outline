import { observer } from "mobx-react";
import * as React from "react";
import styled from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseCellValue,
  DatabaseField,
  DatabaseUserInput,
  DatabaseUserValue,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import type UsersStore from "~/stores/UsersStore";
import { getCell } from "../cells/registry";

interface Props {
  /** The database the field belongs to. */
  database: Database;
  /** The field whose value is picked. */
  field: DatabaseField;
  /** The value, as written (people as Outline user ids). */
  value: DatabaseCellInput | undefined;
  /** Called with the new value. */
  onChange: (value: DatabaseCellInput) => void;
  /** Accessible name of the box. */
  label: string;
  /** Draws an invalid answer. */
  invalid?: boolean;
}

/**
 * A value picked with the cell editor of its field, outside of any row: the
 * value of an automation, the answer to a form question. Click or Enter opens
 * the editor, like a property of a row page.
 *
 * @param props the field, the value and the change callback.
 * @returns the value box.
 */
export const CellValueField = observer(function CellValueField_({
  database,
  field,
  value,
  onChange,
  label,
  invalid,
}: Props) {
  const { users } = useStores();
  const [editing, setEditing] = React.useState(false);
  const cell = getCell(field.type);
  const Editor = cell.Editor;
  const shown = React.useMemo(
    () => inputToCellValue(value, users),
    [value, users]
  );

  const handleStart = React.useCallback(() => {
    if (Editor) {
      setEditing(true);
    }
  }, [Editor]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        !editing &&
        event.target === event.currentTarget &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        handleStart();
      }
    },
    [editing, handleStart]
  );

  const handleClose = React.useCallback(() => setEditing(false), []);

  return (
    <Box
      role="button"
      aria-label={label}
      tabIndex={editing ? undefined : 0}
      $editing={editing}
      $invalid={!!invalid}
      onClick={editing ? undefined : handleStart}
      onKeyDown={handleKeyDown}
    >
      {editing && Editor ? (
        <Editor
          field={field}
          value={shown}
          database={database}
          variant="property"
          onChange={onChange}
          onClose={handleClose}
        />
      ) : (
        <cell.Renderer
          field={field}
          value={shown}
          database={database}
          variant="property"
        />
      )}
    </Box>
  );
});

/**
 * Returns a written value the way cells draw it: people written as Outline
 * user ids become people with their name.
 *
 * @param value the value as written.
 * @param users the users store, to name people.
 * @returns the cell value.
 */
export function inputToCellValue(
  value: DatabaseCellInput | undefined,
  users: UsersStore
): DatabaseCellValue | undefined {
  const person = (input: DatabaseUserInput): DatabaseUserValue => ({
    id: input.outlineUserId,
    title: users.get(input.outlineUserId)?.name ?? "",
    email: users.get(input.outlineUserId)?.email ?? "",
    outlineUserId: input.outlineUserId,
  });
  if (isUserInput(value)) {
    return person(value);
  }
  if (Array.isArray(value) && value.some(isUserInput)) {
    return value.filter(isUserInput).map(person);
  }
  return isCellValue(value) ? value : undefined;
}

function isCellValue(
  value: DatabaseCellInput | undefined
): value is DatabaseCellValue | undefined {
  return (
    !isUserInput(value) && !(Array.isArray(value) && value.some(isUserInput))
  );
}

function isUserInput(value: unknown): value is DatabaseUserInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "outlineUserId" in value &&
    !("id" in value)
  );
}

const Box = styled.div<{ $editing: boolean; $invalid: boolean }>`
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 34px;
  padding: 4px 8px;
  border: 1px solid
    ${(props) => (props.$invalid ? props.theme.danger : props.theme.inputBorder)};
  border-radius: 6px;
  background: ${(props) =>
    props.$editing
      ? props.theme.listItemHoverBackground
      : props.theme.background};
  cursor: var(--pointer);
  outline: none;

  &:hover,
  &:focus-visible {
    border-color: ${s("inputBorderFocused")};
  }
`;

import { CheckmarkIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import { isWritable } from "./editable";
import { toArray } from "./format";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** A checkbox; "editing" it toggles it at once, like a click in Notion. */
export const checkboxCell: CellDefinition = {
  Renderer: CheckboxRenderer,
  Editor: CheckboxEditor,
  isEditable: isWritable,
};

/**
 * Draws a checkbox, checked or not.
 *
 * @param props whether it is checked.
 * @returns the checkbox.
 */
export function CheckboxBox({ checked }: { checked: boolean }) {
  return (
    <Box role="img" aria-checked={checked} $checked={checked}>
      {checked && <CheckmarkIcon size={16} color="currentColor" />}
    </Box>
  );
}

function CheckboxRenderer({ value }: CellRendererProps) {
  const items = toArray(value);
  if (items.length > 1) {
    return (
      <Row>
        {items.map((item, index) => (
          <CheckboxBox key={index} checked={item === true} />
        ))}
      </Row>
    );
  }
  return <CheckboxBox checked={value === true} />;
}

function CheckboxEditor({ value, onChange, onClose }: CellEditorProps) {
  const toggled = React.useRef(false);

  React.useEffect(() => {
    // Development mode mounts effects twice; the toggle must happen once.
    if (toggled.current) {
      return;
    }
    toggled.current = true;
    onChange(value === true ? null : true);
    onClose();
  }, [value, onChange, onClose]);

  return <CheckboxBox checked={value !== true} />;
}

const Row = styled.span`
  display: inline-flex;
  gap: 4px;
`;

const Box = styled.span<{ $checked: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  vertical-align: middle;
  color: ${s("white")};
  background: ${(props) => (props.$checked ? props.theme.accent : "transparent")};
  border: 1.5px solid
    ${(props) => (props.$checked ? props.theme.accent : props.theme.textTertiary)};
`;

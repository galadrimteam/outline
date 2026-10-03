import { CheckmarkIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { ellipsis, s } from "@shared/styles";
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
 * @param props whether it is checked, and `small` for the 14px box of Notion's cards.
 * @returns the checkbox.
 */
export function CheckboxBox({
  checked,
  small = false,
}: {
  checked: boolean;
  small?: boolean;
}) {
  return (
    <Box role="img" aria-checked={checked} $checked={checked} $small={small}>
      {checked && <CheckmarkIcon size={small ? 14 : 16} color="currentColor" />}
    </Box>
  );
}

/**
 * The checkbox of a card, followed by the name of its property as Notion's
 * cards draw it, checked or not: the box alone would not say what it is.
 *
 * @param props whether it is checked and the property's name.
 * @returns the checkbox and its name.
 */
export function CardCheckbox({
  checked,
  name,
}: {
  checked: boolean;
  name: string;
}) {
  return (
    <Labelled>
      <CheckboxBox checked={checked} small />
      <Name>{name}</Name>
    </Labelled>
  );
}

function CheckboxRenderer({ value, field, variant }: CellRendererProps) {
  if (variant === "card" && !Array.isArray(value)) {
    return <CardCheckbox checked={value === true} name={field.name} />;
  }
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

function CheckboxEditor({
  value,
  field,
  variant,
  onChange,
  onClose,
}: CellEditorProps) {
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

  return variant === "card" ? (
    <CardCheckbox checked={value !== true} name={field.name} />
  ) : (
    <CheckboxBox checked={value !== true} />
  );
}

const Row = styled.span`
  display: inline-flex;
  gap: 4px;
`;

// Notion's card: a 14px box with a 1px border, 6px before the property's name in the text colour.
const Labelled = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  line-height: 14px;
`;

const Name = styled.span`
  min-width: 0;
  color: ${s("text")};
  ${ellipsis()}
`;

const Box = styled.span<{ $checked: boolean; $small: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: ${(props) => (props.$small ? 14 : 16)}px;
  height: ${(props) => (props.$small ? 14 : 16)}px;
  border-radius: 3px;
  vertical-align: middle;
  color: ${s("white")};
  background: ${(props) => (props.$checked ? props.theme.accent : "transparent")};
  border: ${(props) => (props.$small ? 1 : 1.5)}px solid
    ${(props) =>
      props.$checked
        ? props.theme.accent
        : props.$small
          ? props.theme.inputBorder
          : props.theme.textTertiary};
`;

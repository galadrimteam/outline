import styled from "styled-components";
import { s } from "@shared/styles";
import { PopoverContent } from "~/components/primitives/Popover";

/** A property menu: a popover with lines and panels, like Notion's property menu. */
export const MenuPanel = styled(PopoverContent)`
  padding: 4px 0;
`;

/** A line of a property menu. */
export const MenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 8px);
  min-height: 30px;
  margin: 0 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 14px;
  text-align: left;
  color: ${(props) => (props.$danger ? props.theme.danger : props.theme.text)};
  cursor: var(--pointer);

  svg {
    flex-shrink: 0;
    color: ${(props) =>
      props.$danger ? props.theme.danger : props.theme.textSecondary};
    fill: currentColor;
  }

  &:hover,
  &:focus-visible,
  &[aria-selected="true"] {
    outline: none;
    background: ${s("listItemHoverBackground")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

/** The label of a menu line, taking the free space. */
export const MenuLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** Secondary text at the end of a menu line (the current type…). */
export const MenuHint = styled.span`
  flex-shrink: 0;
  font-size: 13px;
  color: ${s("textTertiary")};
`;

/** A divider between groups of menu lines. */
export const MenuSeparator = styled.hr`
  margin: 4px 0;
  border: 0;
  border-top: 1px solid ${s("divider")};
`;

/** The text box at the top of a property menu (name, search, description). */
export const MenuInput = styled.input`
  display: block;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 5px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  outline: none;
  font: inherit;
  font-size: 14px;
  color: ${s("text")};
  background: ${s("backgroundSecondary")};

  &:focus {
    border-color: ${s("inputBorderFocused")};
  }

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

/** A multi-line text box of a property menu. */
export const MenuTextarea = styled.textarea`
  display: block;
  width: calc(100% - 16px);
  min-height: 80px;
  margin: 4px 8px;
  padding: 6px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  outline: none;
  resize: vertical;
  font: inherit;
  font-size: 14px;
  color: ${s("text")};
  background: ${s("backgroundSecondary")};

  &:focus {
    border-color: ${s("inputBorderFocused")};
  }
`;

/** A small title above a group of menu lines. */
export const MenuHeading = styled.div`
  padding: 6px 12px 2px;
  font-size: 12px;
  font-weight: 500;
  color: ${s("textTertiary")};
  user-select: none;
`;

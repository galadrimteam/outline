import styled, { css } from "styled-components";
import { ellipsis, s } from "@shared/styles";
import type { CellVariant } from "../types";

interface VariantProps {
  $variant: CellVariant;
  $wrap?: boolean;
}

const singleLine = css`
  ${ellipsis()}
`;

const multiLine = css`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

/** Text of a cell: one truncated line in dense tables, wrapped elsewhere. */
export const CellText = styled.span<VariantProps>`
  display: block;
  min-width: 0;
  color: ${s("text")};
  ${(props) =>
    props.$variant === "table" && !props.$wrap ? singleLine : multiLine}
`;

/** A row of chips (pills, people, linked rows) that wraps except in dense tables. */
export const Chips = styled.span<VariantProps>`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: ${(props) =>
    props.$variant === "table" && !props.$wrap ? "nowrap" : "wrap"};
  overflow: hidden;
`;

/** The grey "Empty" shown for an empty property on a row page. */
export const EmptyValue = styled.span`
  color: ${s("placeholder")};
  user-select: none;
`;

/** A text link inside a cell that must not start editing when clicked. */
export const CellLink = styled.a<VariantProps>`
  color: ${s("text")};
  text-decoration: underline;
  text-decoration-color: ${s("divider")};
  text-underline-offset: 2px;
  ${(props) =>
    props.$variant === "table" && !props.$wrap ? singleLine : multiLine}

  &:hover {
    text-decoration-color: ${s("textSecondary")};
  }
`;

/** A text input that fills the cell it edits. */
export const InlineInput = styled.input`
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: ${s("text")};
  background: transparent;
`;

/** The search box at the top of a popover editor. */
export const SearchInput = styled.input`
  width: 100%;
  border: 0;
  outline: none;
  padding: 8px 12px;
  font: inherit;
  font-size: 14px;
  color: ${s("text")};
  background: ${s("backgroundSecondary")};
  border-bottom: 1px solid ${s("divider")};

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

/** A section title inside a popover editor. */
export const PopoverHeading = styled.div`
  padding: 8px 12px 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${s("textTertiary")};
  user-select: none;
`;

/** A clickable line of a popover list; `aria-selected` marks the keyboard highlight. */
export const PopoverItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  margin: 0 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 14px;
  color: ${s("text")};
  cursor: var(--pointer);
  user-select: none;

  &[aria-selected="true"],
  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

/** The scrollable list part of a popover editor. */
export const PopoverList = styled.div`
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
`;

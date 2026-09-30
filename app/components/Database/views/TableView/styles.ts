import { transparentize } from "polished";
import styled, { css } from "styled-components";
import { s } from "@shared/styles";
import { GUTTER_WIDTH } from "./layout";

/** Height of the header and footer lines. */
export const HEADER_HEIGHT = 34;

const gridLine = css`
  border-bottom: 1px solid
    ${(props) => transparentize(0.2, props.theme.divider)};
`;

const cellLine = css`
  border-right: 1px solid ${(props) => transparentize(0.2, props.theme.divider)};
`;

/** Scrolls the table sideways when it is wider than the page. */
export const Scroller = styled.div`
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
`;

/** The table, as wide as its columns. */
export const Grid = styled.div`
  position: relative;
  min-width: 100%;
  font-size: 14px;
  color: ${s("text")};
  outline: none;
`;

/** A line of the table laid out on the column grid. */
export const Line = styled.div<{ $template: string }>`
  display: grid;
  grid-template-columns: ${(props) => props.$template};
  ${gridLine}
`;

/** The line of column headers. */
export const HeaderLine = styled(Line)`
  height: ${HEADER_HEIGHT}px;
  border-top: 1px solid ${(props) => transparentize(0.2, props.theme.divider)};
  color: ${s("textSecondary")};
`;

/** The rows container: rows are absolutely positioned inside it. */
export const Body = styled.div`
  position: relative;
  width: 100%;
`;

/** A row line, positioned by the virtualizer. */
export const RowLine = styled(Line)<{
  $selected?: boolean;
  $dropSide?: "before" | "after";
}>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background: ${(props) =>
    props.$selected ? transparentize(0.92, props.theme.accent) : "transparent"};

  ${(props) =>
    props.$dropSide &&
    css`
      box-shadow: inset 0 ${props.$dropSide === "before" ? "2px" : "-2px"} 0
        ${props.theme.accent};
    `}

  &:hover [data-gutter-control] {
    opacity: 1;
  }

  &:hover [data-open-button] {
    opacity: 1;
  }
`;

/** A frozen part of a line stays in place when the table scrolls sideways. */
const frozen = css<{ $frozen?: boolean; $left?: number }>`
  ${(props) =>
    props.$frozen &&
    css`
      position: sticky;
      left: ${props.$left ?? 0}px;
      z-index: 2;
      background: ${s("background")};
    `}
`;

/** The left gutter of a line: drag handle and checkbox. */
export const Gutter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding-right: 4px;
  position: sticky;
  left: 0;
  z-index: 2;
  background: ${s("background")};
`;

/** A control in the gutter shown on hover (or while selected). */
export const GutterControl = styled.div<{ $visible?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  color: ${s("textTertiary")};
  transition: opacity 100ms ease;
`;

/** A header cell. */
export const HeaderCell = styled.div<{ $frozen?: boolean; $left?: number }>`
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  ${cellLine}
  ${frozen}
`;

/** The clickable name of a column, opening its menu. */
export const HeaderButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 0 8px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  color: ${s("textSecondary")};
  text-align: left;
  cursor: var(--pointer);

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }

  &:hover,
  &[aria-expanded="true"] {
    background: ${s("listItemHoverBackground")};
  }
`;

/** The handle on the right edge of a header cell that resizes the column. */
export const ResizeHandle = styled.div<{ $active?: boolean }>`
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 6px;
  z-index: 3;
  cursor: col-resize;
  touch-action: none;
  background: ${(props) => (props.$active ? props.theme.accent : "transparent")};

  &:hover {
    background: ${(props) => transparentize(0.5, props.theme.accent)};
  }
`;

/** A body cell. */
export const Cell = styled.div<{
  $frozen?: boolean;
  $left?: number;
  $active?: boolean;
  $wrap?: boolean;
  $editable?: boolean;
  /** The title cell, a little heavier as in Notion. */
  $primary?: boolean;
  /** Room kept on the left when the cell is scrolled into view, under the frozen columns. */
  $scrollMarginLeft?: number;
}>`
  position: relative;
  scroll-margin-left: ${(props) => props.$scrollMarginLeft ?? 0}px;
  display: flex;
  align-items: ${(props) => (props.$wrap ? "flex-start" : "center")};
  min-width: 0;
  min-height: 100%;
  padding: ${(props) => (props.$wrap ? "7px 8px" : "0 8px")};
  overflow: hidden;
  cursor: ${(props) => (props.$editable ? "text" : "default")};
  font-weight: ${(props) => (props.$primary ? 500 : "inherit")};
  ${cellLine}
  ${frozen}

  ${(props) =>
    props.$active &&
    css`
      box-shadow: inset 0 0 0 2px ${transparentize(0.3, props.theme.accent)};
      border-radius: 2px;
    `}
`;

/** The "Open" button of the title cell. */
export const OpenButton = styled.button`
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid ${s("divider")};
  border-radius: 4px;
  background: ${s("background")};
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: ${s("textSecondary")};
  opacity: 0;
  cursor: var(--pointer);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);

  &:hover,
  &:focus-visible {
    opacity: 1;
    background: ${s("listItemHoverBackground")};
  }
`;

/** A line spanning every column: group header, "+ New". */
export const SpanningLine = styled.div<{ $template: string }>`
  display: grid;
  grid-template-columns: ${(props) => props.$template};
  ${gridLine}
`;

/** The content of a spanning line, kept on screen when the table scrolls sideways. */
export const SpanningContent = styled.div`
  position: sticky;
  left: ${GUTTER_WIDTH}px;
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  max-width: 100%;
  min-height: 100%;
  padding: 0 8px;
`;

/** The "+ New" button of the table or of a group. */
export const NewButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  color: ${s("textTertiary")};
  cursor: var(--pointer);

  svg {
    fill: currentColor;
  }

  &:hover {
    color: ${s("textSecondary")};
  }
`;

/** The line of calculations under the rows. */
export const FooterLine = styled(Line)`
  min-height: ${HEADER_HEIGHT}px;
  border-bottom: 0;
`;

/** A calculation cell. */
export const FooterCell = styled.button<{ $frozen?: boolean; $left?: number }>`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
  padding: 0 8px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  color: ${s("textTertiary")};
  white-space: nowrap;
  overflow: hidden;
  cursor: var(--pointer);
  ${frozen}

  &:disabled {
    cursor: default;
  }

  &:hover:not(:disabled) {
    background: ${s("listItemHoverBackground")};
  }

  &:hover [data-placeholder] {
    opacity: 1;
  }
`;

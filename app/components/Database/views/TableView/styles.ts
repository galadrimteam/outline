import { transparentize } from "polished";
import styled, { css } from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { s } from "@shared/styles";
import { GUTTER_WIDTH } from "./layout";

/** Height of the line of column headers, as Notion's. */
export const HEADER_HEIGHT = 36;

/** Height of the line of calculations. */
export const FOOTER_HEIGHT = 34;

// The gutter lies in the page margin, like Notion's row handles: lines start
// where the columns do.
const gridLine = css`
  position: relative;

  &::after {
    content: "";
    position: absolute;
    left: ${GUTTER_WIDTH}px;
    right: 0;
    bottom: 0;
    border-bottom: 1px solid
      ${(props) => transparentize(0.2, props.theme.divider)};
    pointer-events: none;
  }
`;

const cellLine = css`
  border-right: 1px solid ${(props) => transparentize(0.2, props.theme.divider)};
`;

/**
 * Scrolls the table sideways when it is wider than the page. It starts a
 * gutter's width left of the page column so that the drag handles and
 * checkboxes take no room from the columns.
 */
export const Scroller = styled.div`
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;

  ${breakpoint("tablet")`
    margin-inline-start: -${GUTTER_WIDTH}px;
  `};
`;

/**
 * The table, as wide as its columns. Inside a document the editor makes every
 * element content-box: a cell's padding would then add to its `min-height:
 * 100%` and push it, and the « Open » button centred on it, below its row.
 * `&&` outranks the editor's rule.
 */
export const Grid = styled.div`
  position: relative;
  min-width: 100%;
  font-size: 14px;
  color: ${s("text")};
  outline: none;

  &&,
  && * {
    box-sizing: border-box;
  }
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
  color: ${s("textTertiary")};

  &::before {
    content: "";
    position: absolute;
    left: ${GUTTER_WIDTH}px;
    right: 0;
    top: 0;
    border-top: 1px solid ${(props) => transparentize(0.2, props.theme.divider)};
    pointer-events: none;
  }
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

/**
 * The left gutter of a line, in the page margin: « + » and drag handle as in
 * Notion, and the checkbox of the selected rows. It only hides the columns
 * scrolled under it once the table scrolls sideways, so that it never covers
 * the frame of the block.
 */
export const Gutter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 10px;
  position: sticky;
  left: 0;
  z-index: 3;

  [data-scrolled] & {
    background: ${s("background")};
  }
`;

/** A control in the gutter shown on hover (or while rows are selected). */
export const GutterControl = styled.div<{
  $visible?: boolean;
  $width?: number;
}>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: ${(props) => props.$width ?? 20}px;
  height: ${(props) => (props.$width ? 24 : 20)}px;
  border-radius: 4px;
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  color: ${s("textTertiary")};
  transition: opacity 100ms ease;

  svg {
    fill: currentColor;
  }

  &[role="button"]:hover {
    background: ${s("listItemHoverBackground")};
  }
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
  color: ${s("textTertiary")};
  text-align: left;
  cursor: var(--pointer);

  svg {
    flex-shrink: 0;
    margin: 0 1px;
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
  /** Content starts at the top of the cell rather than in its middle. */
  $top?: boolean;
  $editable?: boolean;
  /** The title cell, a little heavier as in Notion. */
  $primary?: boolean;
  /** Room kept on the left when the cell is scrolled into view, under the frozen columns. */
  $scrollMarginLeft?: number;
}>`
  position: relative;
  scroll-margin-left: ${(props) => props.$scrollMarginLeft ?? 0}px;
  display: flex;
  align-items: ${(props) => (props.$top ? "flex-start" : "center")};
  min-width: 0;
  min-height: 100%;
  padding: ${(props) => (props.$top ? "7px 8px" : "0 8px")};
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

/**
 * The "Open" button of the title cell, as Notion draws it: over the end of the
 * title, level with its first line, its frame a shadow rather than a border.
 */
export const OpenButton = styled.button`
  position: absolute;
  top: 6px;
  right: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: ${s("background")};
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${s("textTertiary")};
  opacity: 0;
  cursor: var(--pointer);
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "0 0 0 1px rgba(255, 255, 255, 0.094), 0 2px 6px rgba(0, 0, 0, 0.2)"
      : "rgba(25, 25, 25, 0.027) 0 8px 12px, rgba(25, 25, 25, 0.027) 0 2px 6px, rgba(42, 28, 0, 0.07) 0 0 0 1px"};

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }

  &:hover,
  &:focus-visible {
    opacity: 1;
    background:
      linear-gradient(
        ${s("listItemHoverBackground")},
        ${s("listItemHoverBackground")}
      ),
      ${s("background")};
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
  min-height: ${FOOTER_HEIGHT}px;

  &::after {
    display: none;
  }
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

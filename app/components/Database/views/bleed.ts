import { css } from "styled-components";

/** The CSS variable a database block sets to the room it has right of the text column (see `rightBleed`). */
export const BLEED_VARIABLE = "--database-bleed-right";

/**
 * Lets the horizontal scroller of a view run into that room: its content still
 * starts at the text column, and its end can be scrolled back to the text's
 * right edge, as in Notion.
 */
export const bleedRight = css`
  margin-inline-end: calc(-1 * var(${BLEED_VARIABLE}, 0px));
  padding-inline-end: var(${BLEED_VARIABLE}, 0px);
`;

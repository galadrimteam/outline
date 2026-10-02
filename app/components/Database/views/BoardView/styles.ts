import { css } from "styled-components";

/**
 * Keeps an element's padding and border inside its width and height. The
 * board is drawn inside the editor, whose styles make every element
 * content-box: `width: 100%` plus padding would spill out of its column.
 * `&&` outranks the editor's rule.
 */
export const borderBox = css`
  && {
    box-sizing: border-box;
  }
`;

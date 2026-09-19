import { css } from "styled-components";
import breakpoint from "styled-components-breakpoint";

/**
 * galadrim: geometry of the title block of a page (document or collection),
 * laid out like a Notion page. Numbers measured with getComputedStyle and
 * getBoundingClientRect at 1440x900 on app.notion.com (2026-09-19), identical
 * on the 17 pages sampled:
 *
 *   title      40px / 700 / line-height 48px   (upstream: 36px / 600 / 45px)
 *   page icon  78x78 above the title, its top at y=140, 40px above the title
 *   title top  y=258 with an icon, y=156 without
 *   body       first line box 24px below the title
 *   column     720px wide (ours: 736px, left as is)
 *
 * The scrolling area of the document and collection scenes starts at y=60 (56px
 * header + 4px), hence fixed top margins instead of upstream's 6vh / 8vh.
 */

/** Vertical offset in px at which the content of a scene starts. */
export const pageContentTop = 60;

/** Size in px of the icon above the title. */
export const pageIconSize = 78;

/** Gap in px between the icon and the title, Notion's hover controls row. */
export const pageIconGap = 40;

/**
 * Size in px of the "add icon" button that appears above the title on hover
 * when the page has no icon.
 */
export const pageIconPlaceholderSize = 32;

/**
 * Returns the top margin of the title of a page.
 *
 * @param containsIcon whether an icon is displayed above the title.
 * @param isMobile whether the viewport is below the tablet breakpoint, where
 * the space above the icon is reduced.
 * @returns the margin in px.
 */
export function pageTitleMarginTop(
  containsIcon: boolean,
  isMobile = false
): number {
  if (isMobile) {
    return containsIcon ? 24 + pageIconSize + pageIconGap : 48;
  }
  // 258 and 156 are the measured positions of the title in Notion.
  return (containsIcon ? 258 : 156) - pageContentTop;
}

/** Typography and margins shared by the title of documents and collections. */
export const pageTitleStyles = css<{ $containsIcon: boolean }>`
  line-height: 1.2;
  font-size: 40px;
  font-weight: 700;
  margin-top: ${(props) => pageTitleMarginTop(props.$containsIcon, true)}px;
  margin-bottom: 24px;

  ${breakpoint("tablet")`
    margin-top: ${(props: { $containsIcon: boolean }) =>
      pageTitleMarginTop(props.$containsIcon)}px;
  `};

  /* On paper only the room the icon needs is kept above the title. */
  @media print {
    margin-top: ${(props) =>
      props.$containsIcon ? pageIconSize + pageIconGap : 0}px;
  }
`;

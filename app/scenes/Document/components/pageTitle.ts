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
 * A page that is nothing but a database (2026-09-30, 8 pages): title
 * 32px / 700, its top at y=79 without an icon, the view tabs 10px below.
 *
 * The page of a database row (2026-10-03): its properties 6px below the title,
 * whose last baseline sits 29px above the first property name. In the side
 * peek: icon 36x36 right above a 32px title, the title's top 56px below the
 * top of the content, the properties 14px below the title.
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

/** Size in px of the icon above the title of a row page in the side peek. */
export const peekIconSize = 36;

/**
 * Returns the top margin of the title of a page.
 *
 * @param containsIcon whether an icon is displayed above the title.
 * @param isMobile whether the viewport is below the tablet breakpoint, where
 * the space above the icon is reduced.
 * @param databasePage whether the page is nothing but a full-page database.
 * @param compact whether the page is shown in the side peek of its database.
 * @returns the margin in px.
 */
export function pageTitleMarginTop(
  containsIcon: boolean,
  isMobile = false,
  databasePage = false,
  compact = false
): number {
  if (compact) {
    return containsIcon ? 56 : pageIconPlaceholderSize + 4;
  }
  if (isMobile) {
    return containsIcon ? 24 + pageIconSize + pageIconGap : 48;
  }
  // 258, 156 and 79 are the measured positions of the title in Notion.
  if (databasePage && !containsIcon) {
    return 79 - pageContentTop;
  }
  return (containsIcon ? 258 : 156) - pageContentTop;
}

/** Props of a page title laid out by `pageTitleStyles`. */
export interface PageTitleProps {
  $containsIcon: boolean;
  /** The page is nothing but a full-page database. */
  $databasePage?: boolean;
  /** The page of a database row, its properties right under the title. */
  $databaseRow?: boolean;
  /** The page is shown in the side peek of its database. */
  $compact?: boolean;
}

function pageTitleMarginBottom(props: PageTitleProps): number {
  if (props.$compact) {
    return 10;
  }
  if (props.$databaseRow) {
    return 2;
  }
  return props.$databasePage ? 8 : 24;
}

/** Typography and margins shared by the title of documents and collections. */
export const pageTitleStyles = css<PageTitleProps>`
  line-height: 1.2;
  font-size: ${(props) =>
    props.$compact || (props.$databasePage && !props.$containsIcon)
      ? 32
      : 40}px;
  font-weight: 700;
  margin-top: ${(props) =>
    pageTitleMarginTop(props.$containsIcon, true, false, props.$compact)}px;
  margin-bottom: ${pageTitleMarginBottom}px;

  ${breakpoint("tablet")`
    margin-top: ${(props: PageTitleProps) =>
      pageTitleMarginTop(
        props.$containsIcon,
        false,
        props.$databasePage,
        props.$compact
      )}px;
  `};

  /* On paper only the room the icon needs is kept above the title. */
  @media print {
    margin-top: ${(props) =>
      props.$containsIcon ? pageIconSize + pageIconGap : 0}px;
  }
`;

import { renderToString } from "react-dom/server";
import styled, { ServerStyleSheet, ThemeProvider } from "styled-components";
import { IconTitleWrapper } from "@shared/components/Icon";
import { light } from "@shared/styles/theme";
import {
  pageContentTop,
  pageIconGap,
  pageIconSize,
  pageTitleMarginTop,
  pageTitleStyles,
} from "./pageTitle";

/**
 * Renders an element and returns the CSS styled-components generated for it,
 * without whitespace.
 */
function cssOf(element: React.ReactElement): string {
  const sheet = new ServerStyleSheet();
  try {
    renderToString(
      sheet.collectStyles(
        <ThemeProvider theme={light}>{element}</ThemeProvider>
      )
    );
    return sheet.getStyleTags().replace(/\s+/g, "");
  } finally {
    sheet.seal();
  }
}

describe("pageTitleMarginTop", () => {
  it("puts the title where Notion puts it on a page without icon", () => {
    expect(pageContentTop + pageTitleMarginTop(false)).toBe(156);
  });

  it("puts the title where Notion puts it on a page with an icon", () => {
    expect(pageContentTop + pageTitleMarginTop(true)).toBe(258);
  });

  it("leaves the icon where Notion puts it, above the title", () => {
    const titleTop = pageContentTop + pageTitleMarginTop(true);
    const iconTop = titleTop - pageIconGap - pageIconSize;
    expect(iconTop).toBe(140);
  });

  it("always leaves room for the icon and its gap on mobile", () => {
    expect(pageTitleMarginTop(true, true)).toBeGreaterThanOrEqual(
      pageIconSize + pageIconGap
    );
    expect(pageTitleMarginTop(true, true)).toBeLessThan(
      pageTitleMarginTop(true)
    );
    expect(pageTitleMarginTop(false, true)).toBeLessThan(
      pageTitleMarginTop(false)
    );
  });
});

describe("pageTitleStyles", () => {
  // Same shape as the title of a document: upstream margins first, in the rule
  // and in a media query, then the shared styles.
  const Title = styled.div<{ $containsIcon: boolean }>`
    margin-top: 8vh;
    font-weight: 600;

    @media (min-width: 737px) {
      margin-top: 6vh;
    }

    ${pageTitleStyles}
  `;

  it("wins over margins declared before it, media query included", () => {
    const css = cssOf(<Title $containsIcon />);

    // The generated CSS groups the plain declarations of a rule then appends its
    // media queries in order, so in both places the last value is the one used.
    expect(css.lastIndexOf("margin-top:142px")).toBeGreaterThan(
      css.lastIndexOf("margin-top:8vh")
    );
    expect(css.lastIndexOf("margin-top:198px")).toBeGreaterThan(
      css.lastIndexOf("margin-top:6vh")
    );
    expect(css.lastIndexOf("font-weight:700")).toBeGreaterThan(
      css.lastIndexOf("font-weight:600")
    );
  });

  it("uses the smaller margins without an icon", () => {
    const css = cssOf(<Title $containsIcon={false} />);

    expect(css).toContain("margin-top:48px");
    expect(css).toContain("margin-top:96px");
    expect(css).not.toContain("margin-top:198px");
  });
});

describe("IconTitleWrapper", () => {
  it("keeps the upstream placement by default", () => {
    const css = cssOf(<IconTitleWrapper />);

    expect(css).toContain("top:-44px");
    expect(css).toContain("left:-44px");
    expect(css).not.toContain("bottom:");
  });

  it("places the icon above the title with a specificity that beats the media query", () => {
    const css = cssOf(<IconTitleWrapper $above={pageIconSize} />);
    const rule = css.match(/\.([\w-]+)\.\1\{([^}]*)\}/);

    expect(rule).not.toBeNull();
    expect(rule?.[2]).toContain("top:auto");
    expect(rule?.[2]).toContain("bottom:calc(100%+40px)");
    expect(rule?.[2]).toContain("width:78px");
    expect(rule?.[2]).toContain("height:78px");
    expect(rule?.[2]).toContain("left:0");
  });

  it("mirrors the placement for right-to-left titles and honours the gap", () => {
    const css = cssOf(<IconTitleWrapper dir="rtl" $above={32} $gap={4} />);
    const rule = css.match(/\.([\w-]+)\.\1\{([^}]*)\}/);

    expect(rule?.[2]).toContain("bottom:calc(100%+4px)");
    expect(rule?.[2]).toContain("right:0");
    expect(rule?.[2]).toContain("left:auto");
  });
});

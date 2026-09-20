import { renderToStaticMarkup } from "react-dom/server";
import { ServerStyleSheet, ThemeProvider } from "styled-components";
import theme from "../../styles/theme";
import EditorContainer from "./Styles";

/**
 * Renders the editor container and returns the CSS styled-components emits
 * for it, so the rules below can be read the way a browser reads them.
 */
function editorCss(): string {
  const sheet = new ServerStyleSheet();
  try {
    renderToStaticMarkup(
      sheet.collectStyles(
        <ThemeProvider theme={theme}>
          <EditorContainer $rtl={false} theme={theme} />
        </ThemeProvider>
      )
    );
    return sheet.getStyleTags().replace(/\s+/g, " ");
  } finally {
    sheet.seal();
  }
}

describe("editor styles", () => {
  const css = editorCss();

  it("spaces stacked paragraphs however deeply they are nested", () => {
    // galadrim: Notion keeps the same rhythm inside a callout, a list item or
    // a quote; a mail template dropped in a callout read as one dense block.
    expect(css).toMatch(/\.ProseMirror p \+ p\s*[,{]/);
  });

  it("takes it back out for a plain stack of paragraphs in a table cell", () => {
    expect(css).toMatch(/td > p \+ p\s*[,{]/);
    expect(css).toMatch(/th > p \+ p\s*[,{]/);
  });

  it("leaves a callout inside a table cell its rhythm", () => {
    // A descendant selector there outranks the rule above and flattens every
    // nested block in a cell -- the very defect that rule fixes elsewhere.
    expect(css).not.toMatch(/td p \+ p/);
    expect(css).not.toMatch(/th p \+ p/);
  });

  it("keeps the spacing across an inserted widget", () => {
    expect(css).toMatch(/p \+ \.ProseMirror-widget \+ p\s*[,{]/);
  });
});

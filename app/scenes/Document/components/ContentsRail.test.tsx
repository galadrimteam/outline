import { Provider } from "mobx-react";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { light } from "@shared/styles/theme";
import type { Heading } from "@shared/utils/ProsemirrorHelper";
import {
  DocumentContextProvider,
  useDocumentContext,
} from "~/components/DocumentContext";
import type { Editor } from "~/editor";
import stores from "~/stores";
import ContentsRail from "./ContentsRail";

function WithHeadings({ headings }: { headings: Heading[] }) {
  const context = useDocumentContext();
  useEffect(() => {
    const editor = {
      view: { state: { doc: undefined } },
      getHeadings: () => headings,
      getTasks: () => [],
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    context.setEditor(editor as unknown as Editor);
  }, [context, headings]);
  return <ContentsRail />;
}

const heading = (id: string, level: number): Heading => ({
  id,
  level,
  title: `Titre ${id}`,
});

describe("ContentsRail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    stores.ui.setRightSidebar(null);
  });

  async function render(headings: Heading[]) {
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <DocumentContextProvider>
                <WithHeadings headings={headings} />
              </DocumentContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
  }

  it("lists one link per heading of the document", async () => {
    await render([heading("a", 1), heading("b", 2), heading("c", 2)]);
    const links = container.querySelectorAll("nav a");
    expect(Array.from(links, (link) => link.textContent)).toEqual([
      "Titre a",
      "Titre b",
      "Titre c",
    ]);
  });

  it("is not shown for a page with a single heading", async () => {
    await render([heading("a", 1)]);
    expect(container.querySelector("nav")).toBeNull();
  });

  it("leaves the margin to the right sidebar", async () => {
    stores.ui.setRightSidebar("comments");
    await render([heading("a", 1), heading("b", 2)]);
    expect(container.querySelector("nav")).toBeNull();
  });
});

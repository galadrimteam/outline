import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { getHeaderExpandedKey } from "./Header";
import RecentDocuments from "./RecentDocuments";

const me = "00000000-0000-4000-8000-000000000001";
const collection = "10000000-0000-4000-8000-000000000001";

describe("RecentDocuments", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // The mocked localStorage has no clear(), so the one key this file could
    // write is removed by hand.
    localStorage.removeItem(getHeaderExpandedKey("recent"));
    // The shared window mock (__mocks__/window.js) returns the query string
    // itself, which the responsive hooks then subscribe to.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    stores.documents.clear();
    stores.policies.clear();
    vi.mocked(client.post).mockReset();
    stores.users.add({ id: me, name: "Ada Lovelace" });
    runInAction(() => {
      stores.auth.currentUserId = me;
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /**
   * Adds documents the member has viewed, most recent last.
   *
   * @param count The number of documents to add.
   */
  function addViewedDocuments(count: number) {
    for (let index = 0; index < count; index++) {
      stores.documents.add({
        id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        urlId: `doc${index}`,
        title: `Page ${index}`,
        collectionId: collection,
        lastViewedAt: new Date(2026, 0, 1 + index).toISOString(),
      });
    }
  }

  /** The rows the section rendered, by their text. */
  const rows = () =>
    Array.from(container.querySelectorAll("a, button")).map(
      (node) => node.textContent ?? ""
    );

  const render = () =>
    act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider value={{}}>
                <RecentDocuments />
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });

  it("renders nothing for a member who has viewed no document", async () => {
    await render();

    expect(container.textContent).toBe("");
  });

  it("lists the five most recently viewed documents, newest first", async () => {
    addViewedDocuments(5);

    await render();

    // The heading is a button too, hence the first row.
    expect(rows()).toEqual([
      "Recents",
      "Page 4",
      "Page 3",
      "Page 2",
      "Page 1",
      "Page 0",
    ]);
  });

  it("caps the list at five and offers to show more, as Notion does", async () => {
    addViewedDocuments(9);

    await render();

    expect(rows()).toHaveLength(1 + 5 + 1);
    expect(rows().at(-1)).toBe("Show more…");
  });

  it("lists the rest once show more is clicked", async () => {
    addViewedDocuments(9);
    await render();

    // Not the header's own button, which would collapse the section.
    const showMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Show more")
    );
    await act(async () => {
      showMore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(rows()).toHaveLength(1 + 9);
    expect(rows().at(-1)).toBe("Page 0");
  });
});

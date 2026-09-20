import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { act } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import { light } from "@shared/styles/theme";
import type Collection from "~/models/Collection";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { PRIVATE_COLLECTION_PREFIX } from "../hooks/usePrivateCollection";
import { getHeaderExpandedKey } from "./Header";
import PrivateDocuments from "./PrivateDocuments";

const me = "00000000-0000-4000-8000-000000000001";
const mine = "10000000-0000-4000-8000-000000000001";

describe("PrivateDocuments", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom has no ResizeObserver, which the sidebar's height animation uses.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    // The shared window mock (__mocks__/window.js) returns the query string
    // itself, which the responsive hooks then subscribe to.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    // The mocked localStorage has no clear(), so the one key this file writes
    // is removed by hand.
    localStorage.removeItem(getHeaderExpandedKey("private"));
    stores.collections.clear();
    stores.documents.clear();
    stores.policies.clear();
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockResolvedValue({
      data: [],
      policies: [],
      pagination: { total: 0, limit: 25, offset: 0 },
    } as never);
    stores.users.add({ id: me, name: "Ada Lovelace" });
    stores.policies.add({
      id: mine,
      abilities: { readDocument: true, createDocument: true },
    });
    runInAction(() => {
      stores.auth.currentUserId = me;
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  /** Adds the member's (empty) private collection to the store. */
  function addPrivateCollection(): Collection {
    return stores.collections.add({
      id: mine,
      name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
      // The API sends null for a private collection, which is what isPrivate
      // reads; upstream types the field as optional, hence the cast.
      permission: null as unknown as undefined,
      index: "a",
      sort: { field: "index", direction: "asc" },
    });
  }

  const render = (collection: Collection | undefined) =>
    act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider value={{}}>
                <DndProvider backend={HTML5Backend}>
                  <PrivateDocuments collection={collection} />
                </DndProvider>
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });

  /** The requests the mounted section made for the collection's documents. */
  const documentRequests = () =>
    vi
      .mocked(client.post)
      .mock.calls.filter((call) => call[0] === "/collections.documents");

  it("renders nothing for a member without a private collection", async () => {
    await render(undefined);

    expect(container.textContent).toBe("");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("loads the documents of the collection it lists", async () => {
    await render(addPrivateCollection());

    expect(documentRequests()).toHaveLength(1);
  });

  it("loads nothing while the section is collapsed", async () => {
    // The section passes a constant `expanded` to CollectionLinkChildren; it
    // is Header that unmounts the subtree, and with it the request that would
    // pull the whole tree of the biggest collection a member has.
    localStorage.setItem(
      getHeaderExpandedKey("private"),
      JSON.stringify(false)
    );

    await render(addPrivateCollection());

    expect(documentRequests()).toHaveLength(0);
  });

  it("shows no empty-state row for a collection without documents", async () => {
    await render(addPrivateCollection());

    // The upstream row reads "Empty" and navigates to the collection page,
    // which is the level this section exists to hide.
    expect(container.textContent).not.toContain("Empty");
  });
});

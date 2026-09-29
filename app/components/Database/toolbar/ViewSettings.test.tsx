import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabaseView } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { inPlaceLayoutOverride, ViewSettings } from "./ViewSettings";

const databaseId = "30000000-0000-4000-8000-000000000004";

const listView: DatabaseView = {
  id: "viwList",
  name: "Liste",
  type: "grid",
  layout: DatabaseLayout.List,
  order: 0,
  filter: null,
  sort: null,
  group: null,
  columnMeta: {},
  options: {},
  overrides: { layout: DatabaseLayout.List },
  isLocked: false,
};

describe("inPlaceLayoutOverride", () => {
  it("switches a grid view between table, list and timeline in place", () => {
    expect(inPlaceLayoutOverride(listView, DatabaseLayout.Timeline)).toBe(
      DatabaseLayout.Timeline
    );
    expect(inPlaceLayoutOverride(listView, DatabaseLayout.List)).toBe(
      DatabaseLayout.List
    );
    expect(inPlaceLayoutOverride(listView, DatabaseLayout.Table)).toBeNull();
  });

  it("needs a new view for another engine type", () => {
    expect(
      inPlaceLayoutOverride(listView, DatabaseLayout.Board)
    ).toBeUndefined();
    expect(
      inPlaceLayoutOverride({ type: "kanban" }, DatabaseLayout.Table)
    ).toBeUndefined();
    expect(
      inPlaceLayoutOverride({ type: "gallery" }, DatabaseLayout.List)
    ).toBeUndefined();
  });
});

describe("ViewSettings", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(client.post).mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("draws a list view as a table again without adding a view", async () => {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000001",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [],
      views: [listView],
    });
    const onUpdate = vi.fn();
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ViewSettings
                database={database}
                view={listView}
                onUpdate={onUpdate}
              />
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });

    const click = async (text: string) => {
      const node = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.startsWith(text)
      );
      await act(async () => {
        node?.click();
      });
    };

    await click("Layout");
    const table = Array.from(container.querySelectorAll("[role='radio']")).find(
      (tile) => tile.textContent?.startsWith("Table")
    );
    expect(table?.textContent).toBe("Table");

    await click("Table");
    expect(onUpdate).toHaveBeenCalledWith({ overrides: { layout: null } });
    expect(client.post).not.toHaveBeenCalled();
  });
});

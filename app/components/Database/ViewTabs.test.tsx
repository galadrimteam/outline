import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabaseView } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import type { TabStripMetrics } from "./viewTabsOverflow";
import { ViewTabs } from "./ViewTabs";

const strip = vi.hoisted(() => ({
  metrics: undefined as TabStripMetrics | undefined,
}));

vi.mock("./useTabStripMetrics", () => ({
  useTabStripMetrics: () => ({
    stripRef: { current: null },
    measureRef: { current: null },
    metrics: strip.metrics,
  }),
}));

const databaseId = "30000000-0000-4000-8000-000000000003";

function makeView(index: number): DatabaseView {
  return {
    id: `viw${index}`,
    name: `Vue ${index}`,
    type: "grid",
    layout: DatabaseLayout.Table,
    order: index,
    filter: null,
    sort: null,
    group: null,
    columnMeta: {},
    options: {},
    overrides: {},
    isLocked: false,
  };
}

const views = [0, 1, 2, 3, 4, 5].map(makeView);

describe("ViewTabs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom has no ResizeObserver, which the scrollable menus use.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    vi.mocked(client.post).mockReset();
    strip.metrics = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render({
    activeViewId = "viw0",
    readOnly = false,
    onSelect = vi.fn(),
    onViewCreated,
    lead,
    shown = views,
  }: {
    activeViewId?: string;
    readOnly?: boolean;
    onSelect?: (viewId: string) => void;
    onViewCreated?: (view: DatabaseView) => void;
    lead?: React.ReactNode;
    shown?: DatabaseView[];
  } = {}) {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000001",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [],
      views: shown,
    });
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider value={{}}>
                <ViewTabs
                  database={database}
                  views={shown}
                  activeViewId={activeViewId}
                  readOnly={readOnly}
                  onSelect={onSelect}
                  onViewCreated={onViewCreated}
                  lead={lead}
                />
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    return { database, onSelect };
  }

  const tabNames = () =>
    Array.from(container.querySelectorAll("[role='tab']")).map(
      (node) => node.textContent
    );

  const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (node) =>
        node.getAttribute("aria-label") === label || node.textContent === label
    );

  async function openMenu(trigger: Element | undefined) {
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      );
    });
  }

  const menuItems = () =>
    Array.from(document.querySelectorAll("[role='menuitem']")).map(
      (node) => node.textContent
    );

  // Six tabs of 100px; 400px of room keeps three of them next to « N more » and « + ».
  const narrow = (): TabStripMetrics => ({
    widths: views.map(() => 100),
    available: 400,
    gap: 2,
    moreWidth: 60,
    addWidth: 28,
  });

  it("draws every tab while they fit", async () => {
    await render();
    expect(tabNames()).toEqual(views.map((view) => view.name));
    expect(button("More views")).toBeUndefined();
    expect(button("Add a view")).toBeDefined();
  });

  it("lists the tabs that do not fit under « N more » and keeps « + »", async () => {
    strip.metrics = narrow();
    const { onSelect } = await render();
    expect(tabNames()).toEqual(["Vue 0", "Vue 1", "Vue 2"]);
    expect(button("More views")?.textContent).toBe("3 more…");
    expect(button("Add a view")).toBeDefined();

    await act(async () => {
      button("More views")?.click();
    });
    const panel = () =>
      document.querySelector("[aria-label='More views'][role='dialog']");
    const rows = () =>
      Array.from(panel()?.querySelectorAll("button") ?? []).map(
        (node) => node.textContent
      );
    expect(panel()?.querySelector("input")?.placeholder).toBe(
      "Search for a view…"
    );
    expect(rows()).toEqual([...views.map((view) => view.name), "New view"]);
    expect(panel()?.querySelector("[aria-current='true']")?.textContent).toBe(
      "Vue 0"
    );

    await act(async () => {
      button("Vue 5")?.click();
    });
    expect(onSelect).toHaveBeenCalledWith("viw5");
  });

  it("finds a view by its name in « N more » and creates one from there, as Notion", async () => {
    strip.metrics = narrow();
    const created = {
      ...makeView(9),
      name: "Board",
      layout: DatabaseLayout.Board,
    };
    vi.mocked(client.post).mockResolvedValue({ data: created });
    const onViewCreated = vi.fn();
    await render({ onViewCreated });
    await act(async () => {
      button("More views")?.click();
    });
    const panel = () =>
      document.querySelector("[aria-label='More views'][role='dialog']");
    const input = panel()?.querySelector("input");
    await act(async () => {
      if (input) {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        setValue?.call(input, "vue 4");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(
      Array.from(panel()?.querySelectorAll("button") ?? []).map(
        (node) => node.textContent
      )
    ).toEqual(["Vue 4", "New view"]);

    await act(async () => {
      button("New view")?.click();
    });
    expect(
      Array.from(panel()?.querySelectorAll("button") ?? []).map(
        (node) => node.textContent
      )
    ).toEqual([
      "Table",
      "Board",
      "Calendar",
      "Gallery",
      "List",
      "Timeline",
      "Form",
    ]);
    await act(async () => {
      button("Board")?.click();
    });
    expect(client.post).toHaveBeenCalledWith(
      "/databaseViews.create",
      expect.objectContaining({ databaseId, layout: DatabaseLayout.Board })
    );
    expect(onViewCreated).toHaveBeenCalledWith(created);
  });

  it("draws a view's own icon in its tab, else its layout's", async () => {
    const own = { ...makeView(0), overrides: { icon: "🗺️" } };
    await render({ shown: [own, makeView(1)] });

    const [first, second] = Array.from(
      container.querySelectorAll("[role='tab']")
    );
    expect(first.querySelector("text")?.textContent).toBe("🗺️");
    expect(second.querySelector("text")).toBeNull();
    expect(second.querySelector("svg")).not.toBeNull();
  });

  it("draws the lead in place of the tabs and keeps « + »", async () => {
    await render({ shown: [makeView(0)], lead: <span>Suivi</span> });

    expect(tabNames()).toEqual([]);
    expect(container.textContent).toContain("Suivi");
    expect(button("Add a view")).toBeDefined();
  });

  it("always draws the active tab", async () => {
    strip.metrics = narrow();
    await render({ activeViewId: "viw5" });
    expect(tabNames()).toEqual(["Vue 0", "Vue 1", "Vue 5"]);
    const active = container.querySelector("[aria-selected='true']");
    expect(active?.textContent).toBe("Vue 5");
  });

  it("offers every layout, the form included, in « + »", async () => {
    await render();
    await openMenu(button("Add a view"));
    expect(menuItems()).toEqual([
      "Table",
      "Board",
      "Calendar",
      "Gallery",
      "List",
      "Timeline",
      "Form",
    ]);
  });

  it("asks before deleting a view", async () => {
    const openModal = vi.spyOn(stores.dialogs, "openModal");
    vi.mocked(client.post).mockResolvedValue({ success: true });
    await render({ activeViewId: "viw1" });

    const active = container.querySelector("[aria-selected='true']");
    await act(async () => {
      active?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      button("Delete view")?.click();
    });
    expect(client.post).not.toHaveBeenCalled();
    expect(openModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Delete view?" })
    );

    const { content } = openModal.mock.calls[0][0];
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider value={{}}>
                {content}
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true }));
    });
    expect(client.post).toHaveBeenCalledWith(
      "/databaseViews.delete",
      expect.objectContaining({ databaseId, viewId: "viw1" })
    );
    openModal.mockRestore();
  });

  it("puts a duplicated view next to its source and shows it", async () => {
    const copy = { ...makeView(9), name: "Vue 2 (1)", order: views.length };
    vi.mocked(client.post).mockImplementation(async (path: string) =>
      path === "/databaseViews.duplicate"
        ? { data: copy }
        : { data: [...views.slice(0, 3), copy, ...views.slice(3)] }
    );
    const onSelect = vi.fn();
    const onViewCreated = vi.fn();
    await render({ activeViewId: "viw2", onSelect, onViewCreated });

    const active = container.querySelector("[aria-selected='true']");
    await act(async () => {
      active?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      button("Duplicate")?.click();
    });

    expect(client.post).toHaveBeenCalledWith(
      "/databaseViews.reorder",
      expect.objectContaining({
        viewId: copy.id,
        anchorId: "viw2",
        position: "after",
      })
    );
    expect(onViewCreated).toHaveBeenCalledWith(copy);
    expect(onSelect).toHaveBeenCalledWith(copy.id);
  });
});

import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabaseField, DatabaseView } from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { DatabaseToolbar } from "./DatabaseToolbar";
import { viewDrafts, viewQueryParams } from "./viewDrafts";

const databaseId = "30000000-0000-4000-8000-000000000002";

const fields: DatabaseField[] = [
  {
    id: "name",
    name: "Nom",
    type: DatabaseFieldType.SingleLineText,
    options: {},
    isPrimary: true,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
  },
  {
    id: "status",
    name: "Statut",
    type: DatabaseFieldType.SingleSelect,
    options: { choices: [{ name: "Terminé", color: "green" }] },
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
  },
];

const view: DatabaseView = {
  id: "viw2",
  name: "Kanban",
  type: "kanban",
  layout: DatabaseLayout.Board,
  order: 0,
  filter: null,
  sort: null,
  group: null,
  columnMeta: {},
  options: { stackFieldId: "status" },
  overrides: {},
  isLocked: false,
};

describe("DatabaseToolbar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    vi.mocked(client.post).mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    viewDrafts.reset(databaseId, view.id);
  });

  async function render(readOnly: boolean) {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000001",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields,
      views: [view],
    });
    const query = stores.databaseRecords.query(databaseId, view.id, {});
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider value={{}}>
                <DatabaseToolbar
                  database={database}
                  view={database.viewById(view.id) ?? view}
                  query={query}
                  readOnly={readOnly}
                />
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    return database;
  }

  const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (node) =>
        node.getAttribute("aria-label") === label || node.textContent === label
    );

  async function addStatusFilter() {
    await act(async () => {
      button("Filter")?.click();
    });
    const option = Array.from(
      document.querySelectorAll("[role='option']")
    ).find((node) => node.textContent === "Statut");
    await act(async () => {
      option?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("hides view settings from readers but lets them filter for themselves", async () => {
    const database = await render(true);
    expect(button("Filter")).toBeDefined();
    expect(button("Properties")).toBeUndefined();
    expect(button("Group by")).toBeUndefined();

    await addStatusFilter();
    expect(viewDrafts.get(databaseId, view.id)?.extraFilter).toEqual({
      conjunction: "and",
      filterSet: [{ fieldId: "status", operator: "is", value: null }],
    });
    // The new rule has no value yet, so the rows are not filtered.
    expect(viewQueryParams(database, view, true)).toEqual({});
    expect(button("Reset")).toBeDefined();
    expect(button("Save for everyone")).toBeUndefined();
  });

  it("offers editors to save their filter for everyone", async () => {
    await render(false);
    expect(button("Group by")).toBeDefined();
    expect(button("Properties")).toBeDefined();

    viewDrafts.set(databaseId, view.id, {
      filter: {
        conjunction: "and",
        filterSet: [{ fieldId: "status", operator: "is", value: "Terminé" }],
      },
    });
    await act(async () => undefined);

    vi.mocked(client.post).mockResolvedValue({
      data: {
        ...view,
        filter: {
          conjunction: "and",
          filterSet: [{ fieldId: "status", operator: "is", value: "Terminé" }],
        },
      },
    });
    await act(async () => {
      button("Save for everyone")?.click();
    });

    expect(client.post).toHaveBeenCalledWith(
      "/databaseViews.update",
      expect.objectContaining({
        databaseId,
        viewId: view.id,
        filter: {
          conjunction: "and",
          filterSet: [{ fieldId: "status", operator: "is", value: "Terminé" }],
        },
      })
    );
    expect(viewDrafts.get(databaseId, view.id)).toBeUndefined();
  });

  it("marks an active filter by its colour, without a counter", async () => {
    viewDrafts.set(databaseId, view.id, {
      filter: {
        conjunction: "and",
        filterSet: [{ fieldId: "status", operator: "is", value: "Terminé" }],
      },
    });
    await render(false);

    const filter = button("Filter (1)");
    expect(filter).toBeDefined();
    expect(filter?.textContent).toBe("");
  });

  it("shows ⚡ to editors while an automation is on", async () => {
    stores.policies.add({
      id: databaseId,
      abilities: { read: true, update: true },
    });
    const database = await render(false);
    expect(button("Automations")).toBeUndefined();

    await act(async () => {
      database.automationCount = 2;
    });
    expect(button("Automations")).toBeDefined();

    await act(async () => {
      database.automationCount = 0;
    });
    expect(button("Automations")).toBeUndefined();
  });
});

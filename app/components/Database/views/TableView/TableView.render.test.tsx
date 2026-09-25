import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type {
  DatabaseGroupPoint,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { makeField, makeView } from "./testFixtures";
import { TableView } from ".";

const databaseId = "30000000-0000-4000-8000-000000000002";

const fields = [
  makeField({ id: "name", name: "Nom", isPrimary: true }),
  makeField({
    id: "status",
    name: "Statut",
    type: DatabaseFieldType.SingleSelect,
    options: {
      choices: [
        { name: "À faire", color: "grayLight2" },
        { name: "Terminé", color: "green" },
      ],
    },
  }),
  makeField({
    id: "estimate",
    name: "Estimation",
    type: DatabaseFieldType.Number,
    cellValueType: "number",
    options: { formatting: { type: "decimal", precision: 1 } },
  }),
];

const records: DatabaseRecord[] = [
  { id: "rec1", fields: { name: "Maquettes", status: "Terminé", estimate: 2 } },
  {
    id: "rec2",
    fields: { name: "Intégration", status: "À faire", estimate: 3 },
  },
  { id: "rec3", fields: { name: "Recette", status: "À faire" } },
];

const points: DatabaseGroupPoint[] = [
  { type: "header", id: "g1", depth: 0, value: "Terminé", isCollapsed: false },
  { type: "row", count: 1 },
  { type: "header", id: "g2", depth: 0, value: "À faire", isCollapsed: false },
  { type: "row", count: 2 },
];

describe("TableView", () => {
  let container: HTMLDivElement;
  let root: Root;
  let calls: { path: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    calls = [];
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockImplementation(async (path, body) => {
      calls.push({ path, body: (body ?? {}) as Record<string, unknown> });
      switch (path) {
        case "/databaseRecords.groups":
          return { data: points };
        case "/databaseRecords.aggregate":
          return { data: { estimate: { value: 5 } } };
        case "/databaseRecords.update":
          return { data: records[0] };
        default:
          return {
            data: records,
            pagination: { offset: 0, limit: 100, total: records.length },
          };
      }
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(view: DatabaseView) {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000002",
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
              <ActionContextProvider>
                <TableView
                  database={database}
                  view={view}
                  query={query}
                  readOnly={false}
                  onOpenRecord={() => undefined}
                  onCreateRecord={async () => undefined}
                />
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    await act(async () => {
      await query.fetch();
    });
    return database;
  }

  const wait = (ms: number) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

  it("draws headers, rows and formatted cells", async () => {
    await render(makeView({ id: "viwTable1" }));
    const headers = Array.from(
      container.querySelectorAll("[role='columnheader']")
    ).map((header) => header.textContent);
    expect(headers).toEqual(["Nom", "Statut", "Estimation"]);
    expect(container.querySelectorAll("[role='row'][data-index]")).toHaveLength(
      3
    );
    expect(container.textContent).toContain("Maquettes");
    expect(container.textContent).toContain("Terminé");
    expect(container.textContent).toMatch(/2[.,]0/);
  });

  it("edits a text cell in place and saves it", async () => {
    await render(makeView({ id: "viwTable2" }));
    const cell = container.querySelector<HTMLElement>(
      "[data-cell='rec2:name']"
    );
    await act(async () => {
      cell?.click();
    });
    const input = cell?.querySelector("input");
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, "Intégration v2");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    const update = calls.find(
      (call) => call.path === "/databaseRecords.update"
    );
    expect(update?.body).toMatchObject({
      recordId: "rec2",
      fields: { name: "Intégration v2" },
    });
  });

  it("moves the active cell with the keyboard", async () => {
    await render(makeView({ id: "viwTable3" }));
    const grid = container.querySelector<HTMLElement>("[role='grid']");
    const press = (key: string) =>
      act(async () => {
        grid?.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true })
        );
      });
    await press("ArrowDown");
    expect(
      container
        .querySelector("[data-cell='rec1:name']")
        ?.getAttribute("aria-selected")
    ).toBe("true");
    await press("ArrowDown");
    await press("ArrowRight");
    expect(
      container
        .querySelector("[data-cell='rec2:status']")
        ?.getAttribute("aria-selected")
    ).toBe("true");
  });

  it("draws groups with their counts and the calculations", async () => {
    await render(
      makeView({
        id: "viwTable4",
        group: [{ fieldId: "status", order: "asc" }],
        columnMeta: { estimate: { order: 2, statisticFunc: "sum" } },
      })
    );
    await wait(500);
    const text = container.textContent ?? "";
    expect(text.indexOf("Terminé")).toBeLessThan(text.indexOf("Maquettes"));
    expect(text).toMatch(/Sum5[.,]0/);
    expect(calls.some((call) => call.path === "/databaseRecords.groups")).toBe(
      true
    );
  });
});

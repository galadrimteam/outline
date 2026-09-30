import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type {
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseRecord,
  DatabaseSettings,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import type { RecordQueryParams } from "~/stores/DatabaseRecordsStore";
import { client } from "~/utils/ApiClient";
import { rowCommentCounts } from "../../comments/rowCommentCounts";
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
  {
    id: "rec1",
    fields: {
      name: "Maquettes",
      status: "Terminé",
      estimate: 2,
      progress: 0.5,
    },
  },
  {
    id: "rec2",
    fields: { name: "Intégration", status: "À faire", estimate: 3 },
  },
  { id: "rec3", fields: { name: "Recette", status: "À faire" } },
];

const subItemFields = [
  ...fields,
  makeField({
    id: "children",
    name: "Sous-élément",
    type: DatabaseFieldType.Link,
    isMultipleCellValue: true,
    options: { symmetricFieldId: "parent" },
  }),
  makeField({
    id: "parent",
    name: "Élément parent",
    type: DatabaseFieldType.Link,
    isMultipleCellValue: true,
    options: { symmetricFieldId: "children" },
  }),
];

const subItemRecords: DatabaseRecord[] = [
  {
    id: "sub1",
    fields: { name: "Chat vocal", parent: [{ id: "rec1", title: "Visio" }] },
  },
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
  let listed: DatabaseRecord[];
  let commentCounts: Record<string, number>;

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
    globalThis.CSS ??= { escape: (value: string) => value } as typeof CSS;
    calls = [];
    listed = records;
    commentCounts = {};
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockImplementation(async (path, body) => {
      calls.push({ path, body: (body ?? {}) as Record<string, unknown> });
      switch (path) {
        case "/databaseRecords.groups":
          return { data: points };
        case "/databaseRecords.aggregate":
          return {
            data: {
              estimate: {
                value: 5,
                ...((body as { byGroup?: boolean })?.byGroup
                  ? { groups: { g1: 2, g2: 3 } }
                  : {}),
              },
            },
          };
        case "/databaseRecords.update":
          return { data: records[0] };
        case "/databaseRecords.list":
          if (JSON.stringify(body).includes("hasAnyOf")) {
            return {
              data: subItemRecords,
              pagination: {
                offset: 0,
                limit: 200,
                total: subItemRecords.length,
              },
            };
          }
          return {
            data: listed,
            pagination: { offset: 0, limit: 100, total: listed.length },
          };
        case "/databaseRecords.commentCounts":
          return { data: commentCounts };
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

  async function render(
    view: DatabaseView,
    options: {
      settings?: DatabaseSettings;
      fields?: DatabaseField[];
      params?: RecordQueryParams;
    } = {}
  ) {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000002",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: options.settings ?? {},
      fields: options.fields ?? fields,
      views: [view],
    });
    const query = stores.databaseRecords.query(
      databaseId,
      view.id,
      options.params ?? {}
    );
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

  const grid = () => container.querySelector<HTMLElement>("[role='grid']");

  const pressOnGrid = (key: string, init: KeyboardEventInit = {}) =>
    act(async () => {
      grid()?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...init })
      );
    });

  const pressIn = (element: Element | null | undefined, key: string) =>
    act(async () => {
      element?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      );
    });

  const updates = () =>
    calls.filter((call) => call.path === "/databaseRecords.update");

  it("opens the options of a select cell on Enter without picking one", async () => {
    await render(makeView({ id: "viwTable5" }));
    await pressOnGrid("ArrowDown");
    await pressOnGrid("ArrowRight");
    await pressOnGrid("Enter");

    const search = document.querySelector<HTMLInputElement>(
      "[aria-label='Edit options'] input"
    );
    expect(search).not.toBeNull();
    expect(updates()).toHaveLength(0);

    await pressIn(search, "Enter");
    expect(updates()).toHaveLength(0);
    expect(
      document.querySelector("[aria-label='Edit options'] input")
    ).toBeNull();
  });

  it("picks the option the arrows highlight", async () => {
    await render(makeView({ id: "viwTable6" }));
    await pressOnGrid("ArrowDown");
    await pressOnGrid("ArrowRight");
    await pressOnGrid("Enter");
    const search = document.querySelector<HTMLInputElement>(
      "[aria-label='Edit options'] input"
    );
    await pressIn(search, "ArrowDown");
    await pressIn(search, "Enter");
    expect(updates()[0]?.body).toMatchObject({
      recordId: "rec1",
      fields: { status: "À faire" },
    });
  });

  it("starts editing a text cell with the character typed on it", async () => {
    await render(makeView({ id: "viwTable7" }));
    await pressOnGrid("ArrowDown");
    await pressOnGrid("x");
    const input = container.querySelector<HTMLInputElement>(
      "[data-cell='rec1:name'] input"
    );
    expect(input?.value).toBe("x");
  });

  it("opens a picker with the character typed as its search", async () => {
    await render(makeView({ id: "viwTable8" }));
    await pressOnGrid("ArrowDown");
    await pressOnGrid("ArrowRight");
    await pressOnGrid("t");
    expect(
      document.querySelector<HTMLInputElement>(
        "[aria-label='Edit options'] input"
      )?.value
    ).toBe("t");
  });

  function clipboardEvent(
    type: "copy" | "paste",
    data: Record<string, string>
  ) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (format: string) => data[format] ?? "",
        setData: (format: string, value: string) => {
          data[format] = value;
        },
      },
    });
    return event;
  }

  it("copies the selected cell as text", async () => {
    await render(makeView({ id: "viwTable9" }));
    await pressOnGrid("ArrowDown");
    await pressOnGrid("ArrowRight");
    await pressOnGrid("c", { ctrlKey: true, metaKey: true });
    const bridge = container.querySelector("textarea");
    expect(document.activeElement).toBe(bridge);

    const data: Record<string, string> = {};
    await act(async () => {
      bridge?.dispatchEvent(clipboardEvent("copy", data));
    });
    expect(data["text/plain"]).toBe("Terminé");
  });

  it("pastes lines of text down the column, one update per row", async () => {
    await render(makeView({ id: "viwTable10" }));
    await pressOnGrid("ArrowDown");
    await pressOnGrid("ArrowRight");
    await pressOnGrid("ArrowRight");
    await pressOnGrid("v", { ctrlKey: true, metaKey: true });
    const bridge = container.querySelector("textarea");
    await act(async () => {
      bridge?.dispatchEvent(
        clipboardEvent("paste", { "text/plain": "4\n5,5\n" })
      );
    });
    expect(updates().map((call) => call.body)).toEqual([
      expect.objectContaining({ recordId: "rec1", fields: { estimate: 4 } }),
      expect.objectContaining({ recordId: "rec2", fields: { estimate: 5.5 } }),
    ]);
  });

  it("draws the calculations of the whole table", async () => {
    await render(
      makeView({
        id: "viwTable15",
        columnMeta: { estimate: { order: 2, statisticFunc: "sum" } },
      })
    );
    await wait(500);
    expect(container.textContent).toMatch(/Sum5[.,]0/);
  });

  it("shows the open comments of a row's page after its title", async () => {
    rowCommentCounts.invalidate(databaseId);
    commentCounts = { rec1: 5 };
    await render(makeView({ id: "viwTable11" }));
    await wait(80);

    const notes = container.querySelectorAll("[role='note']");
    expect(notes).toHaveLength(1);
    expect(notes[0].closest("[data-cell]")?.getAttribute("data-cell")).toBe(
      "rec1:name"
    );
    expect(notes[0].textContent).toBe("5");
  });

  it("draws each group with its column headers and its calculations", async () => {
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
    expect(text).toMatch(/Sum2[.,]0[\s\S]*Sum3[.,]0/);
    expect(text).not.toMatch(/Sum5/);
    const headers = Array.from(
      container.querySelectorAll("[role='columnheader']")
    ).map((header) => header.textContent);
    expect(headers).toEqual([
      "Nom",
      "Estimation",
      "Statut",
      "Nom",
      "Estimation",
      "Statut",
    ]);
    expect(
      calls.find((call) => call.path === "/databaseRecords.aggregate")?.body
    ).toMatchObject({ byGroup: true });
    expect(calls.some((call) => call.path === "/databaseRecords.groups")).toBe(
      true
    );
  });

  it("aligns numbers right and draws the ring a number is shown as", async () => {
    await render(makeView({ id: "viwTable14" }), {
      fields: [
        ...fields,
        makeField({
          id: "progress",
          name: "Avancement",
          type: DatabaseFieldType.Formula,
          isComputed: true,
          cellValueType: "number",
          options: {
            formatting: { type: "percent", precision: 0 },
            showAs: { type: "ring", color: "green", maxValue: 100 },
          },
        }),
      ],
    });
    const estimate = container.querySelector(
      "[data-cell='rec1:estimate'] span"
    );
    expect(estimate && getComputedStyle(estimate).textAlign).toBe("right");
    expect(
      container.querySelectorAll("[data-cell='rec1:progress'] svg circle")
    ).toHaveLength(2);
  });

  it("unfolds the sub-items of a row under it", async () => {
    listed = [
      {
        id: "rec1",
        fields: { name: "Visio", children: [{ id: "sub1", title: "Chat" }] },
      },
      { id: "rec2", fields: { name: "Divers" } },
    ];
    await render(makeView({ id: "viwTable12" }), {
      settings: { subItemFieldId: "children" },
      fields: subItemFields,
    });
    expect(container.textContent).not.toContain("Chat vocal");
    const toggles = container.querySelectorAll<HTMLElement>(
      "[aria-label='Show sub-items']"
    );
    expect(toggles).toHaveLength(1);
    await act(async () => {
      toggles[0].click();
    });
    await wait(50);
    const text = container.textContent ?? "";
    expect(text).toContain("Chat vocal");
    expect(text.indexOf("Chat vocal")).toBeLessThan(text.indexOf("Divers"));
    expect(
      calls.some(
        (call) =>
          call.path === "/databaseRecords.list" &&
          JSON.stringify(call.body.filter ?? null).includes('"hasAnyOf"') &&
          JSON.stringify(call.body.filter ?? null).includes('"rec1"')
      )
    ).toBe(true);
  });

  it("writes the parent of a sub-item in a flattened table", async () => {
    listed = subItemRecords;
    await render(
      makeView({ id: "viwTable13", overrides: { subItems: "flattened" } }),
      { settings: { subItemFieldId: "children" }, fields: subItemFields }
    );
    const title = container.querySelector("[data-cell='sub1:name']");
    expect(title?.textContent).toContain("Chat vocal");
    expect(title?.textContent).toContain("Visio");
    expect(container.querySelector("[aria-label='Show sub-items']")).toBeNull();
  });
});

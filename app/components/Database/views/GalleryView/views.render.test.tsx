import { Provider } from "mobx-react";
import { act } from "react";
import type * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type {
  DatabaseField,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import type { RecordQueryParams } from "~/stores/DatabaseRecordsStore";
import { client } from "~/utils/ApiClient";
import { rowCommentCounts } from "../../comments/rowCommentCounts";
import { DatabaseBlockContext } from "../../DatabaseBlockContext";
import { DatabaseToolbar } from "../../toolbar/DatabaseToolbar";
import type { DatabaseViewProps } from "../../types";
import { BoardView } from "../BoardView";
import { CalendarView } from "../CalendarView";
import { ListView } from "../ListView";
import { TimelineView } from "../TimelineView";
import { GalleryView } from ".";

const databaseId = "30000000-0000-4000-8000-000000000001";

const field = (patch: Partial<DatabaseField>): DatabaseField => ({
  id: "fld",
  name: "Field",
  type: DatabaseFieldType.SingleLineText,
  options: {},
  isPrimary: false,
  isComputed: false,
  isLookup: false,
  cellValueType: "string",
  isMultipleCellValue: false,
  ...patch,
});

const fields = [
  field({ id: "name", name: "Nom", isPrimary: true }),
  field({
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
  field({
    id: "start",
    name: "Début",
    type: DatabaseFieldType.Date,
    cellValueType: "dateTime",
    options: { formatting: { timeZone: "Europe/Paris" } },
  }),
  field({
    id: "end",
    name: "Fin",
    type: DatabaseFieldType.Date,
    cellValueType: "dateTime",
    options: { formatting: { timeZone: "Europe/Paris" } },
  }),
  field({
    id: "done",
    name: "Inclus",
    type: DatabaseFieldType.Checkbox,
    cellValueType: "boolean",
  }),
  field({
    id: "blocked",
    name: "Bloqué par",
    type: DatabaseFieldType.Link,
    isMultipleCellValue: true,
    options: { symmetricFieldId: "blocking" },
  }),
  field({
    id: "blocking",
    name: "Bloque",
    type: DatabaseFieldType.Link,
    isMultipleCellValue: true,
    options: { symmetricFieldId: "blocked" },
  }),
  field({
    id: "estimate",
    name: "Estimation",
    type: DatabaseFieldType.Number,
    cellValueType: "number",
  }),
];

const today = new Date();
const iso = (offset: number) =>
  new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + offset
  ).toISOString();

const records: DatabaseRecord[] = [
  {
    id: "rec1",
    fields: {
      name: "Maquettes",
      status: "Terminé",
      done: true,
      start: iso(-3),
      end: iso(1),
      blocking: [{ id: "rec2", title: "Intégration", icon: "🧱" }],
    },
    documentId: "50000000-0000-4000-8000-000000000001",
    icon: "🎨",
  },
  {
    id: "rec2",
    fields: {
      name: "Intégration",
      status: "À faire",
      start: iso(2),
      end: iso(6),
      blocked: [{ id: "rec1", title: "Maquettes" }],
    },
  },
  { id: "rec3", fields: { name: "Sans date" } },
];

function makeView(patch: Partial<DatabaseView>): DatabaseView {
  return {
    id: "viw1",
    name: "Vue",
    type: "grid",
    layout: DatabaseLayout.Table,
    order: 0,
    filter: null,
    sort: null,
    group: null,
    columnMeta: {
      status: { order: 1, visible: true },
      start: { order: 2, visible: true },
    },
    options: {},
    overrides: {},
    isLocked: false,
    ...patch,
  };
}

describe("database views", () => {
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
    // jsdom's selector engine throws on the board's `:has()` rules once a Radix popover, whose
    // ids hold colons, is open; browsers do not.
    const computedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element, pseudo) => {
        try {
          return computedStyle(element, pseudo);
        } catch {
          return document.createElement("div").style;
        }
      }
    );
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockResolvedValue({
      data: records,
      pagination: { offset: 0, limit: 100, total: records.length },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(
    View: React.ComponentType<DatabaseViewProps>,
    view: DatabaseView,
    handlers: {
      onOpenRecord?: (recordId: string) => void;
    } = {},
    params: RecordQueryParams = {}
  ) {
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
    const query = stores.databaseRecords.query(databaseId, view.id, params);
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider>
                <DatabaseToolbar
                  database={database}
                  view={view}
                  query={query}
                  readOnly={false}
                />
                <DatabaseBlockContext.Provider
                  value={{
                    onViewCreated: () => undefined,
                    filterRequest: undefined,
                  }}
                >
                  <View
                    database={database}
                    view={view}
                    query={query}
                    readOnly={false}
                    onOpenRecord={handlers.onOpenRecord ?? (() => undefined)}
                    onCreateRecord={async () => undefined}
                  />
                </DatabaseBlockContext.Provider>
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    await act(async () => {
      await query.fetch();
    });
  }

  it("draws a gallery grouped by status", async () => {
    await render(
      GalleryView,
      makeView({
        type: "gallery",
        layout: DatabaseLayout.Gallery,
        group: [{ fieldId: "status", order: "asc" }],
      })
    );
    expect(container.textContent).toContain("Maquettes");
    expect(container.textContent).toContain("Sans date");
    expect(container.querySelectorAll("section")).toHaveLength(3);
    expect(container.querySelector("section")?.textContent).toContain(
      "No Statut"
    );
  });

  it("titles the groups of a checkbox with the box and the property name", async () => {
    await render(
      GalleryView,
      makeView({
        type: "gallery",
        layout: DatabaseLayout.Gallery,
        group: [{ fieldId: "done", order: "desc" }],
      })
    );
    const sections = Array.from(container.querySelectorAll("section"));
    expect(sections).toHaveLength(2);
    const titles = sections.map(
      (section) => section.querySelector("button")?.textContent
    );
    expect(titles).toEqual(["Inclus1", "Inclus2"]);
    expect(
      sections.map((section) =>
        section.querySelector("[aria-checked]")?.getAttribute("aria-checked")
      )
    ).toEqual(["true", "false"]);
  });

  it("leaves the group of the rows a formula leaves empty untitled, as Notion", async () => {
    const formula = field({
      id: "quality",
      name: "Q Estim",
      type: DatabaseFieldType.Formula,
      isComputed: true,
    });
    fields.push(formula);
    try {
      vi.mocked(client.post).mockResolvedValue({
        data: [
          { id: "recA", fields: { name: "Sans qualité" } },
          { id: "recB", fields: { name: "Juste", quality: "RAS" } },
        ],
        pagination: { offset: 0, limit: 100, total: 2 },
      });
      await render(
        GalleryView,
        makeView({
          id: "viwFormula",
          type: "gallery",
          layout: DatabaseLayout.Gallery,
          group: [{ fieldId: "quality", order: "asc" }],
        })
      );
      const titles = Array.from(container.querySelectorAll("section")).map(
        (section) => section.querySelector("button")?.textContent
      );
      expect(titles).toEqual(["1", "RAS1"]);
    } finally {
      fields.pop();
    }
  });

  it("pages each group of a gallery on its own and counts all its rows", async () => {
    const many: DatabaseRecord[] = [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `recTodo${index}`,
        fields: { name: `À faire ${index}`, status: "À faire" },
      })),
      { id: "recDone", fields: { name: "Fini", status: "Terminé" } },
    ];
    vi.mocked(client.post).mockImplementation(
      async (path: string, body?: object) => {
        const { offset = 0, limit = 100 } = (body ?? {}) as {
          offset?: number;
          limit?: number;
        };
        return path === "/databaseRecords.list"
          ? {
              data: many.slice(offset, offset + limit),
              pagination: { offset, limit, total: many.length },
            }
          : { data: {} };
      }
    );
    await render(
      GalleryView,
      makeView({
        id: "viwPaged",
        type: "gallery",
        layout: DatabaseLayout.Gallery,
        group: [{ fieldId: "status", order: "asc" }],
      }),
      {},
      { pageSize: 25 }
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const sections = Array.from(container.querySelectorAll("section"));
    expect(sections).toHaveLength(2);
    const cards = (section: Element) =>
      section.querySelectorAll("[role='button'][aria-label]").length;
    expect(sections[0].querySelector("button")?.textContent).toContain("30");
    expect(cards(sections[0])).toBe(25);
    expect(cards(sections[1])).toBe(1);
    const more = Array.from(sections[0].querySelectorAll("button")).find(
      (button) => button.textContent === "Load more"
    );
    expect(more).toBeTruthy();
    await act(async () => {
      more?.click();
    });
    expect(cards(sections[0])).toBe(30);
    expect(container.textContent?.match(/Load more/g) ?? []).toHaveLength(0);
  });

  it("draws gallery cards with the icon of their page and the colour of their option", async () => {
    await render(
      GalleryView,
      makeView({
        type: "gallery",
        layout: DatabaseLayout.Gallery,
        options: { colorConfig: { type: "field", fieldId: "status" } },
        columnMeta: { blocking: { order: 1, visible: true } },
      })
    );
    const card = container.querySelector<HTMLElement>(
      "[role='button'][style*='background']"
    );
    expect(card?.textContent).toContain("🎨");
    expect(card?.textContent).toContain("Maquettes");
    expect(card?.style.background).toBe("rgb(237, 243, 236)");
    expect(container.textContent).toContain("🧱");
  });

  const checkboxesOf = (card: Element | undefined) =>
    Array.from(card?.querySelectorAll("[aria-checked]") ?? []).map(
      (box) =>
        `${box.getAttribute("aria-checked")} ${box.parentElement?.textContent}`
    );

  it("draws a checkbox on gallery cards with its property name, checked or not, as Notion", async () => {
    await render(
      GalleryView,
      makeView({
        type: "gallery",
        layout: DatabaseLayout.Gallery,
        columnMeta: { done: { order: 1, visible: true } },
      })
    );
    const card = (title: string) =>
      Array.from(container.querySelectorAll("[role='button']")).find((node) =>
        node.querySelector("div")?.textContent?.includes(title)
      );
    expect(checkboxesOf(card("Maquettes"))).toEqual(["true Inclus"]);
    expect(checkboxesOf(card("Intégration"))).toEqual(["false Inclus"]);
  });

  it("draws a checkbox on board cards with its property name, checked or not, as Notion", async () => {
    await render(
      BoardView,
      makeView({
        type: "kanban",
        layout: DatabaseLayout.Board,
        options: { stackFieldId: "status" },
        columnMeta: { done: { order: 1, visible: true } },
      })
    );
    await settle();
    expect(checkboxesOf(cardOf("Maquettes"))).toEqual(["true Inclus"]);
    expect(checkboxesOf(cardOf("Intégration"))).toEqual(["false Inclus"]);
  });

  it("puts Notion's page glyph before the title of a written page without an icon, nothing before a row without a page", async () => {
    const rows: DatabaseRecord[] = [
      {
        id: "recWritten",
        fields: { name: "Écrite", status: "À faire" },
        documentId: "50000000-0000-4000-8000-000000000009",
      },
      { id: "recBlank", fields: { name: "Vierge", status: "À faire" } },
    ];
    vi.mocked(client.post).mockResolvedValue({
      data: rows,
      pagination: { offset: 0, limit: 100, total: rows.length },
    });
    await render(
      GalleryView,
      makeView({
        id: "viwGlyph",
        type: "gallery",
        layout: DatabaseLayout.Gallery,
      })
    );
    const heading = (title: string) =>
      Array.from(container.querySelectorAll("[role='button'] > div")).find(
        (node) => node.textContent?.includes(title)
      )?.firstElementChild;
    expect(
      heading("Écrite")?.querySelector("[aria-hidden] svg")
    ).not.toBeNull();
    expect(heading("Vierge")?.querySelector("svg")).toBeNull();
  });

  it("draws a list", async () => {
    await render(
      ListView,
      makeView({ overrides: { layout: DatabaseLayout.List } })
    );
    expect(container.querySelectorAll("[role='listitem']")).toHaveLength(3);
  });

  it("heads board columns with the view's calculation in the option's colour", async () => {
    vi.mocked(client.post).mockImplementation(async (path: string) =>
      path === "/databaseRecords.aggregate"
        ? { data: { estimate: { value: 42 } } }
        : {
            data: records,
            pagination: { offset: 0, limit: 50, total: records.length },
          }
    );
    await render(
      BoardView,
      makeView({
        type: "kanban",
        layout: DatabaseLayout.Board,
        options: { stackFieldId: "status" },
        overrides: {
          groupCalculation: { func: "sum", fieldId: "estimate" },
          stackOrder: ["Terminé"],
          hiddenStacks: ["", "À faire"],
        },
      })
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    const header = container.querySelector("[aria-roledescription='Column']");
    expect(header?.textContent).toContain("42");
    expect(
      vi
        .mocked(client.post)
        .mock.calls.some(
          ([path, body]) =>
            path === "/databaseRecords.aggregate" &&
            JSON.stringify(body).includes('"estimate":"sum"')
        )
    ).toBe(true);
    expect(container.textContent).toContain("New page");
  });

  const boardView = () =>
    makeView({
      type: "kanban",
      layout: DatabaseLayout.Board,
      options: { stackFieldId: "status" },
      columnMeta: { status: { order: 1, visible: true } },
    });

  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

  const cardOf = (title: string) =>
    Array.from(
      container.querySelectorAll<HTMLElement>("[role='button'][aria-label]")
    ).find((card) => card.getAttribute("aria-label") === title);

  it("edits only the property clicked on a board card, without opening the row", async () => {
    const opened: string[] = [];
    await render(BoardView, boardView(), {
      onOpenRecord: (id) => opened.push(id),
    });
    await settle();

    const property = cardOf("Maquettes")?.querySelector<HTMLElement>(
      "[role='button'][aria-label='Statut']"
    );
    expect(property).toBeTruthy();
    await act(async () => {
      property?.click();
    });
    expect(
      document.querySelector("[aria-label='Edit options'] input")
    ).not.toBeNull();
    expect(opened).toEqual([]);

    await act(async () => {
      cardOf("Intégration")?.click();
    });
    expect(opened).toEqual(["rec2"]);
  });

  it("opens the comments of a card's row on the spot from its comment count", async () => {
    rowCommentCounts.invalidate(databaseId);
    vi.mocked(client.post).mockImplementation(async (path: string) => {
      if (path === "/databaseRecords.open") {
        throw new Error("the popover's content is tested on its own");
      }
      return path === "/databaseRecords.commentCounts"
        ? { data: { rec1: 2 } }
        : {
            data: records,
            pagination: { offset: 0, limit: 50, total: records.length },
          };
    });
    const opened: string[] = [];
    await render(BoardView, boardView(), {
      onOpenRecord: (id) => opened.push(id),
    });
    await settle();

    const count = cardOf("Maquettes")?.querySelector<HTMLElement>(
      "button[aria-label^='2 comment']"
    );
    expect(count?.textContent).toBe("2");
    await act(async () => {
      count?.click();
    });
    expect(
      document.querySelector("[role='dialog'][aria-label='Comments']")
    ).not.toBeNull();
    expect(opened).toEqual([]);
  });

  it("edits the property clicked on a gallery card", async () => {
    const opened: string[] = [];
    await render(
      GalleryView,
      makeView({ type: "gallery", layout: DatabaseLayout.Gallery }),
      { onOpenRecord: (id) => opened.push(id) }
    );
    const property = container.querySelector<HTMLElement>(
      "[role='button'][aria-label='Statut']"
    );
    await act(async () => {
      property?.click();
    });
    expect(
      document.querySelector("[aria-label='Edit options'] input")
    ).not.toBeNull();
    expect(opened).toEqual([]);
  });

  it("draws a month calendar with dated rows only", async () => {
    await render(
      CalendarView,
      makeView({
        type: "calendar",
        layout: DatabaseLayout.Calendar,
        options: { startDateFieldId: "start", endDateFieldId: "end" },
      })
    );
    expect(container.querySelector("[aria-current='date']")).not.toBeNull();
    expect(container.textContent).toContain("Intégration");
    expect(container.textContent).not.toContain("Sans date");
  });

  it("draws a timeline with a dependency arrow", async () => {
    await render(
      TimelineView,
      makeView({
        overrides: {
          layout: DatabaseLayout.Timeline,
          timeline: {
            startFieldId: "start",
            endFieldId: "end",
            dependencyFieldId: "blocked",
            zoom: "week",
          },
        },
      })
    );
    expect(container.textContent).not.toContain("Sans date");
    expect(container.textContent).toContain("No date (1)");
    expect(container.querySelectorAll("svg path[marker-end]")).toHaveLength(1);
    expect(
      container.querySelectorAll("[aria-label^='Maquettes,']")
    ).toHaveLength(1);
    expect(container.querySelector("[aria-label='Show table']")).not.toBeNull();
    expect(container.querySelector("[aria-label='Previous']")).not.toBeNull();
    expect(container.querySelector("[aria-label='Next']")).not.toBeNull();
  });

  it("keeps the label of a bar that starts before the part in sight at the left edge, as Notion", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    await render(
      TimelineView,
      makeView({
        overrides: {
          layout: DatabaseLayout.Timeline,
          timeline: { startFieldId: "start", endFieldId: "end", zoom: "week" },
        },
      })
    );
    expect(
      container.querySelector("[aria-label='Go to the start']")
    ).toBeNull();

    const bar = container.querySelector<HTMLElement>(
      "[aria-label^='Maquettes,']"
    );
    const scroller = container.querySelector("[aria-busy]")?.lastElementChild;
    await act(async () => {
      if (scroller && bar) {
        scroller.scrollLeft = parseFloat(bar.style.left) + 2 * 64;
        scroller.dispatchEvent(new Event("scroll"));
      }
    });
    const back = container.querySelector<HTMLElement>(
      "[aria-label='Go to the start']"
    );
    expect(back).not.toBeNull();
    expect(back?.parentElement?.textContent).toContain("Maquettes");
    expect(
      container.querySelectorAll("[aria-label='Go to the end']").length
    ).toBeGreaterThan(0);

    act(() => back?.click());
    expect(scrollTo).toHaveBeenCalledWith({
      left: parseFloat(bar?.style.left ?? "0") - 64,
      behavior: "smooth",
    });
  });
});

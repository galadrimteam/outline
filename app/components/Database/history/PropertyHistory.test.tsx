import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabaseHistoryEntry } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { makeField, makeView } from "../views/TableView/testFixtures";
import { PropertyHistory } from "./PropertyHistory";

const databaseId = "30000000-0000-4000-8000-000000000031";

const entries: DatabaseHistoryEntry[] = [
  {
    id: "his2",
    fieldId: "status",
    fieldName: "Statut",
    fieldType: DatabaseFieldType.SingleSelect,
    before: "À faire",
    after: "Terminé",
    createdTime: new Date().toISOString(),
    createdBy: { id: "usr1", title: "Ada Lovelace", email: "ada@example.com" },
  },
  {
    id: "his1",
    fieldId: "gone",
    fieldName: "Ancienne propriété",
    fieldType: DatabaseFieldType.SingleLineText,
    before: null,
    after: "Valeur",
    createdTime: new Date().toISOString(),
    createdBy: null,
  },
];

describe("PropertyHistory", () => {
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
    calls = [];
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockImplementation(async (path, body) => {
      calls.push({ path, body: (body ?? {}) as Record<string, unknown> });
      const cursor = (body as { cursor?: string } | undefined)?.cursor;
      return cursor
        ? { data: [], pagination: {} }
        : { data: entries, pagination: { nextCursor: "page2" } };
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000031",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [
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
      ],
      views: [makeView({ id: "viwHistory" })],
    });
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <PropertyHistory database={database} recordId="rec1" />
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
  }

  it("shows who changed which property, from what to what", async () => {
    await render();

    expect(calls[0]).toEqual({
      path: "/databaseRecords.history",
      body: { databaseId, recordId: "rec1", cursor: undefined },
    });
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Ada Lovelace");
    expect(items[0].textContent).toContain("Statut");
    expect(items[0].textContent).toContain("À faire");
    expect(items[0].textContent).toContain("Terminé");
    expect(items[1].textContent).toContain("Ancienne propriété");
    expect(items[1].textContent).toContain("Empty");
    expect(items[1].textContent).toContain("Valeur");
  });

  it("loads the next page on demand", async () => {
    await render();
    const more = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Show more"
    );

    await act(async () => {
      more?.click();
    });

    expect(calls[1]?.body).toMatchObject({ cursor: "page2" });
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });
});

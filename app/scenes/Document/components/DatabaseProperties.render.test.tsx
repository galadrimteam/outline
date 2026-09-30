import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabaseField, DatabaseSettings } from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { DatabaseProperties } from "./DatabaseProperties";

const databaseId = "30000000-0000-4000-8000-000000000003";

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
    options: { choices: [{ name: "En cours", color: "blue" }] },
  }),
  field({ id: "notes", name: "Notes", type: DatabaseFieldType.LongText }),
];

describe("DatabaseProperties", () => {
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(
    settings: DatabaseSettings,
    readOnly: boolean,
    home: string | null = null
  ) {
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockImplementation(async (path) => {
      if (path === "/databaseRecords.info") {
        return {
          data: {
            id: "rec1",
            fields: { name: "Maquettes", status: "En cours" },
          },
        };
      }
      return {
        data: {
          database: {
            id: databaseId,
            title: "Suivi",
            icon: null,
            collectionId: "40000000-0000-4000-8000-000000000003",
            documentId: home,
            url: `/db/${databaseId}`,
            settings,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          fields,
          views: [
            {
              id: "viw1",
              name: "Table",
              type: "grid",
              layout: DatabaseLayout.Table,
              order: 0,
              filter: null,
              sort: null,
              group: null,
              columnMeta: {},
              options: {},
              overrides: {},
              isLocked: false,
            },
          ],
        },
      };
    });
    stores.databases.remove(databaseId);
    const document = stores.documents.add({
      id: "50000000-0000-4000-8000-000000000003",
      title: "Maquettes",
      collectionId: "40000000-0000-4000-8000-000000000003",
      databaseId,
      databaseRecordId: "rec1",
      parentDocumentId: home ?? undefined,
    });

    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider>
                <DatabaseProperties document={document} readOnly={readOnly} />
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("lists the properties of the row, the title left out", async () => {
    await render({}, false);
    const text = container.textContent ?? "";
    expect(text).toContain("Statut");
    expect(text).toContain("En cours");
    expect(text).toContain("Notes");
    expect(text).not.toContain("Nom");
    expect(text).toContain("Add a property");
    expect(text).toContain("Customize page");
    expect(
      container.querySelector(`a[href='/db/${databaseId}']`)
    ).not.toBeNull();
  });

  it("hides empty properties behind a toggle, read-only for readers", async () => {
    await render({ pageLayout: { hideWhenEmptyFieldIds: ["notes"] } }, true);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Notes");
    expect(text).toContain("1 more properties");
    expect(text).not.toContain("Add a property");
  });

  it("follows the page order of the layout", async () => {
    await render({ pageLayout: { fieldOrder: ["notes", "status"] } }, false);
    const text = container.textContent ?? "";
    expect(text.indexOf("Notes")).toBeLessThan(text.indexOf("Statut"));
  });

  it("shows only the pinned properties, the others behind « Show details »", async () => {
    await render({ pageLayout: { pinnedFieldIds: ["notes"] } }, true);
    const text = container.textContent ?? "";
    expect(text).toContain("Notes");
    expect(text).toContain("Show details");
    expect(text).not.toContain("Statut");
  });

  it("leaves the link to the database to the breadcrumb when it leads there", async () => {
    await render({}, false, "60000000-0000-4000-8000-000000000003");
    expect(container.querySelector(`a[href='/db/${databaseId}']`)).toBeNull();
  });
});

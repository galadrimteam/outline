import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type {
  DatabaseField,
  DatabaseFilterItem,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { FilterValueEditor } from "./FilterValueEditor";

const databaseId = "30000000-0000-4000-8000-000000000006";

function makeField(
  id: string,
  type: DatabaseFieldType,
  extra: Partial<DatabaseField> = {}
): DatabaseField {
  return {
    id,
    name: id,
    type,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: true,
    ...extra,
  };
}

const owner = makeField("owner", DatabaseFieldType.User);
const project = makeField("project", DatabaseFieldType.Link, {
  options: { foreignTableId: "tblProjects" },
});

describe("FilterValueEditor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
    vi.mocked(client.post).mockImplementation(async (path: string, body) => {
      switch (path) {
        case "/databaseRecords.groups":
          return {
            data: [
              {
                type: "header",
                id: "g1",
                depth: 0,
                value: JSON.stringify(body).includes('"fieldId":"owner"')
                  ? [{ id: "usrBob", title: "Bob" }]
                  : [{ id: "recZeus", title: "Zeus" }],
                isCollapsed: false,
              },
              { type: "row", count: 2 },
            ],
          };
        case "/databaseRecords.linkCandidates":
          return { data: [{ id: "recApollo", title: "Apollo" }] };
        default:
          return { data: [] };
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

  async function openPicker(field: DatabaseField, item: DatabaseFilterItem) {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000001",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [owner, project],
      views: [],
    });
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <FilterValueEditor
                database={database}
                field={field}
                item={item}
                viewId="viwBoard"
                records={[]}
                onChange={vi.fn()}
              />
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    await act(async () => {
      container.querySelector("button")?.click();
    });
    return Array.from(document.querySelectorAll("[role='option']")).map(
      (node) => node.textContent
    );
  }

  it("offers the people of every row and the team's members without loaded rows", async () => {
    stores.users.clear();
    stores.users.add({
      id: "50000000-0000-4000-8000-000000000001",
      name: "Cyrille",
      avatarUrl: "",
      color: "#000",
      isSuspended: false,
    });
    const options = await openPicker(owner, {
      fieldId: "owner",
      operator: "hasAnyOf",
      value: null,
    });

    expect(client.post).toHaveBeenCalledWith(
      "/databaseRecords.groups",
      expect.objectContaining({
        databaseId,
        viewId: "viwBoard",
        groupBy: [{ fieldId: "owner", order: "asc" }],
      })
    );
    // Avatars without a picture draw the initial before the name.
    expect(options).toEqual(["Me", "BBob", "CCyrille"]);
  });

  it("offers the rows of the linked table to editors", async () => {
    stores.policies.add({
      id: databaseId,
      abilities: { read: true, update: true },
    });
    const options = await openPicker(project, {
      fieldId: "project",
      operator: "hasAnyOf",
      value: null,
    });

    expect(client.post).toHaveBeenCalledWith(
      "/databaseRecords.linkCandidates",
      expect.objectContaining({ databaseId, fieldId: "project", limit: 50 })
    );
    expect(options).toEqual(["Apollo", "Zeus"]);
  });
});

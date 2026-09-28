import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabaseView } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { makeField, makeView } from "../views/TableView/testFixtures";
import { rowTemplates } from "./rowTemplates";
import { NewRecordMenu } from "./NewRecordMenu";

const me = "00000000-0000-4000-8000-000000000011";
const databaseId = "30000000-0000-4000-8000-000000000011";
const collectionId = "40000000-0000-4000-8000-000000000011";
const templateId = "50000000-0000-4000-8000-000000000011";
const documentId = "60000000-0000-4000-8000-000000000011";

describe("NewRecordMenu", () => {
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
    stores.users.add({ id: me, name: "Ada Lovelace" });
    runInAction(() => {
      stores.auth.currentUserId = me;
    });
    calls = [];
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockImplementation(async (path, body) => {
      calls.push({ path, body: (body ?? {}) as Record<string, unknown> });
      if (path === "/databaseRecords.createFromTemplate") {
        return {
          data: {
            record: { id: "recNew", fields: { name: "Réunion" }, documentId },
            document: { id: documentId, title: "Réunion", collectionId },
          },
          policies: [],
        };
      }
      return { data: [], pagination: { offset: 0, limit: 25, total: 0 } };
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
    handlers: {
      onCreateEmpty?: () => void;
      onOpenRecord?: (recordId: string) => void;
    } = {}
  ) {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId,
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [makeField({ id: "name", name: "Nom", isPrimary: true })],
      views: [view],
    });
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider>
                <NewRecordMenu
                  database={database}
                  view={view}
                  canEditView
                  defaults={{ status: "À faire" }}
                  onCreateEmpty={handlers.onCreateEmpty ?? (() => undefined)}
                  onOpenRecord={handlers.onOpenRecord ?? (() => undefined)}
                />
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
  }

  function button(label: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (item) =>
        item.textContent === label || item.getAttribute("aria-label") === label
    );
  }

  it("creates an empty row without a default template", async () => {
    const onCreateEmpty = vi.fn();
    await render(makeView({ id: "viwNew1" }), { onCreateEmpty });

    await act(async () => {
      button("New")?.click();
    });

    expect(onCreateEmpty).toHaveBeenCalledTimes(1);
    expect(
      calls.find((call) => call.path === "/databaseRecords.createFromTemplate")
    ).toBeUndefined();
  });

  it("creates the row from the view's default template and opens it", async () => {
    const onOpenRecord = vi.fn();
    await render(
      makeView({ id: "viwNew2", overrides: { defaultTemplateId: templateId } }),
      { onOpenRecord }
    );

    await act(async () => {
      button("New")?.click();
    });

    const create = calls.find(
      (call) => call.path === "/databaseRecords.createFromTemplate"
    );
    expect(create?.body).toEqual({
      databaseId,
      templateId,
      fields: { status: "À faire" },
      order: undefined,
    });
    expect(onOpenRecord).toHaveBeenCalledWith("recNew");
    expect(stores.documents.get(documentId)?.title).toEqual("Réunion");
    expect(
      stores.databaseRecords.recordById(databaseId, "recNew")
    ).toBeTruthy();
  });

  it("offers the templates from its arrow", async () => {
    await render(makeView({ id: "viwNew3" }));

    expect(button("New from template")).toBeTruthy();
  });
});

describe("rowTemplates", () => {
  it("lists the collection's templates, then the workspace's", () => {
    const template = (id: string, collection: string | null) =>
      stores.templates.add({
        id,
        title: id,
        collectionId: collection,
        publishedAt: new Date().toISOString(),
      });
    const ofWorkspace = template("70000000-0000-4000-8000-000000000001", null);
    const ofCollection = template(
      "70000000-0000-4000-8000-000000000002",
      collectionId
    );
    const elsewhere = template(
      "70000000-0000-4000-8000-000000000003",
      "40000000-0000-4000-8000-000000000099"
    );

    expect(
      rowTemplates([ofWorkspace, elsewhere, ofCollection], { collectionId })
    ).toEqual([ofCollection, ofWorkspace]);
  });
});

import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import { toast } from "sonner";
import { vi } from "vitest";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { PRIVATE_COLLECTION_PREFIX } from "~/components/Sidebar/hooks/usePrivateCollection";
import DocumentNew from "./DocumentNew";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("~/routes/scenes", () => ({ preloadEditor: vi.fn() }));

const me = "00000000-0000-4000-8000-000000000001";
const mine = "10000000-0000-4000-8000-000000000001";
const team = "10000000-0000-4000-8000-000000000002";
const created = "20000000-0000-4000-8000-000000000001";

/**
 * Loads the given collections into the store and answers the memberships
 * requests that the private collection detection makes.
 *
 * @param names The name of each collection, by id.
 * @param membershipsFail Whether the memberships requests fail.
 */
async function load(names: Record<string, string>, membershipsFail = false) {
  const listed = Object.entries(names).map(([id, name], index) => ({
    id,
    name,
    permission: null,
    index: `a${index}`,
  }));

  vi.mocked(client.post).mockImplementation(((path: string) => {
    if (path === "/collections.list") {
      return Promise.resolve({
        data: listed,
        policies: [],
        pagination: { total: listed.length, limit: 25, offset: 0 },
      });
    }

    if (membershipsFail) {
      return Promise.reject(new Error("offline"));
    }

    return Promise.resolve({
      data:
        path === "/collections.memberships"
          ? {
              users: [],
              memberships: [
                {
                  id: "m",
                  collectionId: mine,
                  userId: me,
                  permission: "admin",
                },
              ],
            }
          : { groups: [], groupMemberships: [] },
      policies: [],
      pagination: { total: 1, limit: 25, offset: 0 },
    });
  }) as unknown as typeof client.post);

  await stores.collections.fetchAll();
}

describe("DocumentNew", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    stores.collections.clear();
    stores.documents.clear();
    stores.memberships.clear();
    stores.groupMemberships.clear();
    stores.policies.clear();
    vi.mocked(client.post).mockReset();
    vi.mocked(toast.error).mockClear();
    stores.users.add({ id: me, name: "Ada Lovelace" });
    // The collections store hides a collection whose policy denies reading it.
    stores.policies.add({
      id: mine,
      abilities: { readDocument: true, createDocument: true },
    });
    stores.policies.add({
      id: team,
      abilities: { readDocument: true, createDocument: true },
    });
    runInAction(() => {
      stores.auth.currentUserId = me;
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

  /** Mounts the scene and returns the spy standing in for documents.create. */
  async function render() {
    const doc = stores.documents.add({
      id: created,
      urlId: "abcdef",
      title: "",
      collectionId: mine,
    });
    const create = vi.spyOn(stores.documents, "create").mockResolvedValue(doc);

    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter initialEntries={["/doc/new"]}>
            <Route path="/doc/new">
              <DocumentNew />
            </Route>
          </MemoryRouter>
        </Provider>
      );
    });

    return create;
  }

  it("publishes an unfiled document into the member's private collection", async () => {
    await load({
      [team]: "Tech",
      [mine]: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
    });

    const create = await render();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ collectionId: mine });
    expect(create.mock.calls[0][1]).toMatchObject({ publish: true });
  });

  it("keeps the upstream draft for a member without a private collection", async () => {
    await load({ [team]: "Tech" });

    const create = await render();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ collectionId: undefined });
    expect(create.mock.calls[0][1]).toMatchObject({ publish: undefined });
  });

  it("creates nothing when the private collection cannot be resolved", async () => {
    // Silently falling back to a draft would put the same click's page in two
    // different places depending on whether one request went through.
    await load({ [mine]: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace` }, true);

    const create = await render();

    expect(create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

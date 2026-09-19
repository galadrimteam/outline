import { runInAction } from "mobx";
import { Provider, observer } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import usePrivateCollection, {
  PRIVATE_COLLECTION_PREFIX,
} from "./usePrivateCollection";

const me = "00000000-0000-4000-8000-000000000001";
const someoneElse = "00000000-0000-4000-8000-000000000002";
const mine = "10000000-0000-4000-8000-000000000001";
const theirs = "10000000-0000-4000-8000-000000000002";

const Probe = observer(function Probe() {
  const collection = usePrivateCollection();
  return <output>{collection?.id ?? "none"}</output>;
});

/**
 * Loads private collections with the given names into the store, as the API
 * returns them, then answers the memberships requests.
 *
 * @param names The name of each collection, by id.
 * @param members The user ids that are members of each collection.
 */
async function load(
  names: Record<string, string>,
  members: Record<string, string[]>
) {
  const listed = Object.entries(names).map(([id, name], index) => ({
    id,
    name,
    permission: null,
    index: `a${index}`,
  }));

  vi.mocked(client.post).mockImplementation(((
    path: string,
    params: { id: string }
  ) =>
    Promise.resolve({
      policies: [],
      data:
        path === "/collections.list"
          ? listed
          : path === "/collections.memberships"
            ? {
                users: [],
                memberships: (members[params.id] ?? []).map((userId) => ({
                  id: `${params.id}-${userId}`,
                  collectionId: params.id,
                  userId,
                  permission: "admin",
                })),
              }
            : { groups: [], groupMemberships: [] },
      pagination: { total: 0, limit: 25, offset: 0, nextPath: "" },
    })) as unknown as typeof client.post);

  await stores.collections.fetchAll();
  vi.mocked(client.post).mockClear();
}

describe("usePrivateCollection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    stores.collections.clear();
    stores.memberships.clear();
    stores.groupMemberships.clear();
    vi.mocked(client.post).mockReset();
    stores.users.add({ id: me, name: "Ada Lovelace" });
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
  });

  const render = () =>
    act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <Probe />
        </Provider>
      );
    });

  it("returns nothing for a member without a private collection", async () => {
    await load({ [theirs]: "Tech" }, {});

    await render();

    expect(container.textContent).toBe("none");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("returns the private collection of which the user is the only member", async () => {
    await load(
      { [mine]: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace` },
      { [mine]: [me] }
    );

    await render();

    expect(container.textContent).toBe(mine);
    expect(client.post).toHaveBeenCalledTimes(2);
  });

  it("drops a candidate once another member is found", async () => {
    await load(
      { [mine]: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace` },
      { [mine]: [me, someoneElse] }
    );

    await render();

    expect(container.textContent).toBe("none");
  });

  it("keeps only the verified collection among several candidates", async () => {
    await load(
      {
        [theirs]: `${PRIVATE_COLLECTION_PREFIX}Al`,
        [mine]: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
      },
      { [mine]: [me], [theirs]: [someoneElse, me] }
    );

    await render();

    expect(container.textContent).toBe(mine);
  });

  it("does not treat a candidate as private when the check fails", async () => {
    await load({ [mine]: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace` }, {});
    vi.mocked(client.post).mockImplementation((() =>
      Promise.reject(new Error("offline"))) as unknown as typeof client.post);

    await render();

    expect(container.textContent).toBe("none");
  });
});

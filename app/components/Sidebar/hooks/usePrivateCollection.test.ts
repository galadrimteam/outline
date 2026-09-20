import { runInAction } from "mobx";
import { vi } from "vitest";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import {
  PRIVATE_COLLECTION_PREFIX,
  PRIVATE_COLLECTION_TRIAL_SUFFIX,
  fetchIsSoleMember,
  findPrivateCollection,
  hasOtherMembers,
  isExcludedCandidate,
  isPrivateCollectionCandidate,
  privateCollectionName,
  resolvePrivateCollection,
} from "./usePrivateCollection";

const me = "00000000-0000-4000-8000-000000000001";
const someoneElse = "00000000-0000-4000-8000-000000000002";
const mine = "10000000-0000-4000-8000-000000000001";
const team = "10000000-0000-4000-8000-000000000002";
const trial = "10000000-0000-4000-8000-000000000003";

interface Members {
  userIds: string[];
  groupIds?: string[];
}

interface ListedCollection {
  id: string;
  name: string;
  permission: string | null;
  index: string;
}

/**
 * Answers the API calls made by the helpers with synthetic data.
 *
 * @param members The members of each collection, by collection id. A missing collection makes the memberships request fail.
 * @param listed The collections returned by `collections.list`.
 */
function mockApi(
  members: Record<string, Members>,
  listed: ListedCollection[] = []
) {
  vi.mocked(client.post).mockImplementation(((
    path: string,
    params: { id: string }
  ) => {
    const pagination = { total: 0, limit: 25, offset: 0, nextPath: "" };

    if (path === "/collections.list") {
      return Promise.resolve({
        data: listed,
        policies: [],
        pagination: { ...pagination, total: listed.length },
      });
    }

    const found = members[params.id];
    if (!found) {
      return Promise.reject(new Error("offline"));
    }

    if (path === "/collections.memberships") {
      return Promise.resolve({
        data: {
          users: [],
          memberships: found.userIds.map((userId) => ({
            id: `${params.id}-${userId}`,
            collectionId: params.id,
            userId,
            permission: "admin",
          })),
        },
        pagination,
      });
    }

    if (path === "/collections.group_memberships") {
      return Promise.resolve({
        data: {
          groups: [],
          groupMemberships: (found.groupIds ?? []).map((groupId) => ({
            id: `${params.id}-${groupId}`,
            collectionId: params.id,
            groupId,
            permission: "read",
          })),
        },
        pagination,
      });
    }

    return Promise.reject(new Error(`unexpected request ${path}`));
  }) as unknown as typeof client.post);
}

beforeEach(() => {
  stores.collections.clear();
  runInAction(() => {
    stores.collections.isLoaded = false;
  });
  stores.memberships.clear();
  stores.groupMemberships.clear();
  vi.mocked(client.post).mockReset();
});

describe("PRIVATE_COLLECTION_PREFIX", () => {
  it("is the importer's prefix: composed é, spaces around an en dash", () => {
    expect(
      Array.from(PRIVATE_COLLECTION_PREFIX, (char) => char.codePointAt(0))
    ).toEqual([0x50, 0x72, 0x69, 0x76, 0xe9, 0x20, 0x2013, 0x20]);
  });
});

describe("privateCollectionName", () => {
  it("is the name the importer gives to the member's collection", () => {
    expect(privateCollectionName("Ada Lovelace")).toBe(
      `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`
    );
  });

  it("truncates to the 90 characters the importer keeps", () => {
    expect(privateCollectionName("x".repeat(200))).toHaveLength(90);
  });
});

describe("isPrivateCollectionCandidate", () => {
  it("accepts a private collection named with the prefix", () => {
    expect(
      isPrivateCollectionCandidate({
        id: mine,
        name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
        isPrivate: true,
      })
    ).toBe(true);
  });

  it("accepts a decomposed é", () => {
    expect(PRIVATE_COLLECTION_PREFIX.normalize("NFD")).not.toBe(
      PRIVATE_COLLECTION_PREFIX
    );
    expect(
      isPrivateCollectionCandidate({
        id: mine,
        name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`.normalize("NFD"),
        isPrivate: true,
      })
    ).toBe(true);
  });

  it("rejects a collection that is open to the workspace", () => {
    expect(
      isPrivateCollectionCandidate({
        id: mine,
        name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
        isPrivate: false,
      })
    ).toBe(false);
  });

  it("rejects the collection of a trial import", () => {
    // The migrator's /?limit=3 run makes a private, sole-member collection
    // that the lead deletes afterwards – new pages must never land in it,
    // even while it is the only candidate.
    expect(
      isPrivateCollectionCandidate({
        id: trial,
        name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace${PRIVATE_COLLECTION_TRIAL_SUFFIX}`,
        isPrivate: true,
      })
    ).toBe(false);
  });

  it("rejects other names", () => {
    for (const name of [
      "Tech",
      "Privé - Ada Lovelace",
      "Privé",
      "Espace Privé – Ada Lovelace",
    ]) {
      expect(
        isPrivateCollectionCandidate({ id: team, name, isPrivate: true })
      ).toBe(false);
    }
  });
});

describe("findPrivateCollection", () => {
  const collections = [
    { id: team, name: "Tech", isPrivate: true },
    {
      id: trial,
      name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace${PRIVATE_COLLECTION_TRIAL_SUFFIX}`,
      isPrivate: true,
    },
    {
      id: mine,
      name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
      isPrivate: true,
    },
  ];

  it("ignores the trial collection and keeps the imported one", () => {
    expect(findPrivateCollection(collections, () => false)).toBe(
      collections[2]
    );
  });

  it("returns nothing when only the trial collection is left", () => {
    expect(
      findPrivateCollection(
        collections,
        (collection) => collection === collections[2]
      )
    ).toBe(undefined);
  });

  it("prefers the name the importer gives to the current user", () => {
    const candidates = [
      {
        id: someoneElse,
        name: `${PRIVATE_COLLECTION_PREFIX}Alan Turing`,
        isPrivate: true,
      },
      {
        id: mine,
        name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
        isPrivate: true,
      },
    ];

    expect(
      findPrivateCollection(
        candidates,
        () => false,
        privateCollectionName("Ada Lovelace")
      )
    ).toBe(candidates[1]);
  });

  it("is deterministic when two candidates cannot be told apart", () => {
    const name = `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`;
    const first = { id: mine, name, isPrivate: true };
    const second = { id: team, name, isPrivate: true };

    // Neither the order the server listed them in nor the expected name can
    // decide, so the smallest id does – the same one every time.
    expect(findPrivateCollection([first, second], () => false, name)).toBe(
      first
    );
    expect(findPrivateCollection([second, first], () => false, name)).toBe(
      first
    );
  });

  it("returns undefined without a candidate", () => {
    expect(findPrivateCollection([collections[0]], () => false)).toBe(
      undefined
    );
    expect(findPrivateCollection(collections, () => true)).toBe(undefined);
    expect(findPrivateCollection([], () => false)).toBe(undefined);
  });

  it("does not reorder the given collections", () => {
    const copy = [...collections];
    findPrivateCollection(collections, () => false);
    expect(collections).toEqual(copy);
  });
});

describe("isExcludedCandidate", () => {
  it("trusts a single candidate while its memberships load", () => {
    expect(isExcludedCandidate(undefined, false, 1)).toBe(false);
  });

  it("waits for the verification when there are several candidates", () => {
    expect(isExcludedCandidate(undefined, false, 2)).toBe(true);
    expect(isExcludedCandidate(true, false, 2)).toBe(false);
  });

  it("excludes a candidate that failed the check or has another member", () => {
    expect(isExcludedCandidate(false, false, 1)).toBe(true);
    expect(isExcludedCandidate(true, true, 1)).toBe(true);
    expect(isExcludedCandidate(undefined, true, 1)).toBe(true);
  });
});

describe("hasOtherMembers", () => {
  it("is false when the user is the only known member", () => {
    stores.memberships.add({ id: "m1", collectionId: mine, userId: me });
    stores.memberships.add({
      id: "m2",
      collectionId: team,
      userId: someoneElse,
    });

    expect(hasOtherMembers(stores, mine, me)).toBe(false);
  });

  it("is true when another user is a member", () => {
    stores.memberships.add({ id: "m1", collectionId: mine, userId: me });
    stores.memberships.add({
      id: "m2",
      collectionId: mine,
      userId: someoneElse,
    });

    expect(hasOtherMembers(stores, mine, me)).toBe(true);
  });

  it("is true when a group is a member", () => {
    stores.memberships.add({ id: "m1", collectionId: mine, userId: me });
    stores.groupMemberships.add({
      id: "g1",
      collectionId: mine,
      groupId: "group",
    });

    expect(hasOtherMembers(stores, mine, me)).toBe(true);
  });
});

describe("fetchIsSoleMember", () => {
  it("asks for the memberships of the collection only", async () => {
    mockApi({ [mine]: { userIds: [me] } });

    await expect(fetchIsSoleMember(stores, mine, me)).resolves.toBe(true);
    expect(client.post).toHaveBeenCalledWith("/collections.memberships", {
      id: mine,
      limit: 2,
    });
    expect(client.post).toHaveBeenCalledWith("/collections.group_memberships", {
      id: mine,
      limit: 1,
    });
  });

  it("is false with another user or a group", async () => {
    mockApi({
      [mine]: { userIds: [me, someoneElse] },
      [team]: { userIds: [me], groupIds: ["group"] },
    });

    await expect(fetchIsSoleMember(stores, mine, me)).resolves.toBe(false);
    await expect(fetchIsSoleMember(stores, team, me)).resolves.toBe(false);
  });

  it("rejects when the memberships cannot be loaded", async () => {
    mockApi({});

    await expect(fetchIsSoleMember(stores, mine, me)).rejects.toThrow();
  });
});

describe("resolvePrivateCollection", () => {
  const listed = [
    { id: team, name: "Tech", permission: null, index: "a" },
    {
      id: trial,
      name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace (test)`,
      permission: null,
      index: "b",
    },
    {
      id: mine,
      name: `${PRIVATE_COLLECTION_PREFIX}Ada Lovelace`,
      permission: null,
      index: "c",
    },
  ];

  it("loads the collections and returns the verified private one", async () => {
    mockApi(
      {
        [mine]: { userIds: [me] },
        [trial]: { userIds: [me] },
        [team]: { userIds: [me] },
      },
      listed
    );

    const collection = await resolvePrivateCollection(
      stores,
      me,
      "Ada Lovelace"
    );
    expect(collection?.id).toBe(mine);
  });

  it("never files a document into a trial import", async () => {
    // Between the trial run and the real one the "(test)" collection is the
    // only candidate: the document must stay an unfiled draft instead.
    mockApi({ [trial]: { userIds: [me] } }, [listed[0], listed[1]]);

    await expect(
      resolvePrivateCollection(stores, me, "Ada Lovelace")
    ).resolves.toBe(undefined);
  });

  it("ignores a candidate shared with someone else", async () => {
    mockApi(
      {
        [mine]: { userIds: [me, someoneElse] },
        [trial]: { userIds: [me] },
      },
      listed
    );

    await expect(
      resolvePrivateCollection(stores, me, "Ada Lovelace")
    ).resolves.toBe(undefined);
  });

  it("rejects when a candidate cannot be verified", async () => {
    // Resolving to undefined here would silently produce an unfiled draft on
    // a dropped request, and a page in "Privé" on the next click.
    mockApi({}, [listed[2]]);

    await expect(resolvePrivateCollection(stores, me)).rejects.toThrow();
  });

  it("returns undefined for a member without a private collection", async () => {
    mockApi({}, [listed[0]]);

    await expect(resolvePrivateCollection(stores, me)).resolves.toBe(undefined);
  });
});

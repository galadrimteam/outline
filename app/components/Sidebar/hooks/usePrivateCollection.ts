// galadrim: Notion's "Private" section, without a schema change.
//
// The Notion importer puts each member's private pages into ONE private
// collection named "Privé – <Prénom Nom>" of which that member is the only
// member. The sidebar shows the documents of that collection directly under a
// "Privé" heading, and new unfiled documents are created in it.
//
// The collection is recognised by convention rather than by a flag:
// - it is private (`permission` is null),
// - its name starts with PRIVATE_COLLECTION_PREFIX and is not a trial import,
// - the current user is its only member (no other user, no group).
// Trade-off versus a real `isPersonal` column: no migration and nothing to
// keep in sync with upstream, at the price of two small requests per candidate
// (usually exactly one) and of a naming convention – renaming the collection,
// or adding a member to it, turns it back into an ordinary collection that is
// listed with the others.
import { useEffect, useState } from "react";
import type Collection from "~/models/Collection";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import type RootStore from "~/stores/RootStore";

/**
 * Prefix of the name of a member's private collection, as created by the
 * Notion importer: "Privé", a space, an EN DASH (U+2013) and a space.
 */
export const PRIVATE_COLLECTION_PREFIX = "Privé – ";

/**
 * Suffix the Notion importer appends to the collection of a *trial* run
 * (`/?limit=3` in `deploy/migrator/app.py`). Such a collection is private and
 * has the member as its only member, so it would otherwise qualify – and until
 * the real import has run it would be the *only* candidate, which would file
 * the member's new pages into a throwaway collection the lead deletes later.
 */
export const PRIVATE_COLLECTION_TRIAL_SUFFIX = " (test)";

/** The importer truncates a collection name to 90 characters. */
const COLLECTION_NAME_MAX_LENGTH = 90;

/** The fields of a collection that the detection relies on. */
interface PrivateCollectionFields {
  /** The identifier of the collection. */
  id: string;
  /** The name of the collection. */
  name: string;
  /** Whether the collection is only accessible to its members. */
  isPrivate: boolean;
}

/** The stores needed to look up who a collection is shared with. */
type MembershipStores = Pick<RootStore, "memberships" | "groupMemberships">;

/**
 * The name the Notion importer gives to a member's private collection.
 *
 * @param userName The full name of the member.
 * @returns the expected collection name.
 */
export function privateCollectionName(userName: string): string {
  return `${PRIVATE_COLLECTION_PREFIX}${userName}`
    .normalize("NFC")
    .slice(0, COLLECTION_NAME_MAX_LENGTH);
}

/**
 * Whether a collection looks like a member's private collection: private,
 * named with the importer's prefix, and not a trial import. Membership is
 * checked separately.
 *
 * @param collection The collection to test.
 * @returns true if the collection is a candidate.
 */
export function isPrivateCollectionCandidate(
  collection: PrivateCollectionFields
): boolean {
  const name = collection.name.normalize("NFC");

  return (
    collection.isPrivate &&
    name.startsWith(PRIVATE_COLLECTION_PREFIX) &&
    !name.endsWith(PRIVATE_COLLECTION_TRIAL_SUFFIX)
  );
}

/** Compares two strings so that an order never depends on the input order. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Orders two candidates, best first: the name the importer would have given to
 * the current user wins, then the shortest name, then the name and the id –
 * the choice must never depend on the order the server listed them in.
 *
 * @param a The first candidate.
 * @param b The second candidate.
 * @param expectedName The name the importer gives to this user's collection.
 * @returns a negative number when `a` is the better candidate.
 */
function comparePrivateCandidates<T extends PrivateCollectionFields>(
  a: T,
  b: T,
  expectedName?: string
): number {
  const matchesExpected = (collection: T) =>
    expectedName !== undefined &&
    collection.name.normalize("NFC") === expectedName.normalize("NFC");

  return (
    Number(matchesExpected(b)) - Number(matchesExpected(a)) ||
    a.name.length - b.name.length ||
    compareStrings(a.name, b.name) ||
    compareStrings(a.id, b.id)
  );
}

/**
 * Picks the current user's private collection among the given collections.
 *
 * @param collections The collections to choose from, in display order.
 * @param isShared Returns true for a collection that someone else can access.
 * @param expectedName The name the importer gives to this user's collection, see privateCollectionName.
 * @returns the private collection, or undefined if there is none.
 */
export function findPrivateCollection<T extends PrivateCollectionFields>(
  collections: T[],
  isShared: (collection: T) => boolean,
  expectedName?: string
): T | undefined {
  return collections
    .filter(
      (collection) =>
        isPrivateCollectionCandidate(collection) && !isShared(collection)
    )
    .sort((a, b) => comparePrivateCandidates(a, b, expectedName))[0];
}

/**
 * Whether anyone other than the given user is known, from the memberships
 * loaded so far, to have access to a collection.
 *
 * @param stores The membership stores.
 * @param collectionId The collection to test.
 * @param userId The current user.
 * @returns true if another user or any group is a member of the collection.
 */
export function hasOtherMembers(
  stores: MembershipStores,
  collectionId: string,
  userId: string
): boolean {
  return (
    stores.memberships.orderedData.some(
      (membership) =>
        membership.collectionId === collectionId && membership.userId !== userId
    ) || stores.groupMemberships.inCollection(collectionId).length > 0
  );
}

/**
 * Loads enough of a collection's memberships to tell whether the given user is
 * its only member.
 *
 * @param stores The membership stores.
 * @param collectionId The collection to test.
 * @param userId The current user.
 * @returns true if the user is the only member of the collection.
 * @throws if the memberships could not be loaded.
 */
export async function fetchIsSoleMember(
  stores: MembershipStores,
  collectionId: string,
  userId: string
): Promise<boolean> {
  // Two user memberships are enough to know whether there is someone else.
  await Promise.all([
    stores.memberships.fetchPage({ id: collectionId, limit: 2 }),
    stores.groupMemberships.fetchPage({ collectionId, limit: 1 }),
  ]);
  return !hasOtherMembers(stores, collectionId, userId);
}

/**
 * Resolves the current user's private collection, for use outside of render
 * (eg. when creating a document). Strict: a candidate whose memberships cannot
 * be checked makes this reject instead of quietly resolving to undefined – the
 * caller has to tell "this member has no private collection" from "we could
 * not find out", because the two file the document in different places.
 *
 * @param stores The root store.
 * @param userId The current user.
 * @param userName The name of the current user, see privateCollectionName.
 * @returns the private collection, or undefined if there is none.
 * @throws if the collections, or the memberships of a candidate, cannot be loaded.
 */
export async function resolvePrivateCollection(
  stores: Pick<RootStore, "collections" | "memberships" | "groupMemberships">,
  userId: string,
  userName?: string
): Promise<Collection | undefined> {
  if (!stores.collections.isLoaded) {
    await stores.collections.fetchAll();
  }

  const candidates = stores.collections.allActive.filter((collection) =>
    isPrivateCollectionCandidate(collection)
  );
  const verified = await Promise.all(
    candidates.map((collection) =>
      fetchIsSoleMember(stores, collection.id, userId)
    )
  );

  return findPrivateCollection(
    candidates,
    (collection) => !verified[candidates.indexOf(collection)],
    userName === undefined ? undefined : privateCollectionName(userName)
  );
}

/**
 * Whether a candidate is left out of the "Privé" section given what is known
 * about its memberships. While they load the name is trusted if it is
 * unambiguous, which is the overwhelmingly common outcome; with several
 * candidates (eg. an admin kept as a member of other people's private
 * collections) only a verified one qualifies.
 *
 * @param verified The result of the membership check – undefined while it is pending, false if it failed or found someone else.
 * @param hasOthers Whether another member is known from the stores.
 * @param candidateCount The number of candidate collections.
 * @returns true if the candidate must be treated as an ordinary collection.
 */
export function isExcludedCandidate(
  verified: boolean | undefined,
  hasOthers: boolean,
  candidateCount: number
): boolean {
  if (verified === false || hasOthers) {
    return true;
  }
  return verified === undefined && candidateCount > 1;
}

/**
 * Returns the current user's private collection, if any. The calling component
 * must be a MobX observer. Unlike resolvePrivateCollection this one fails
 * soft: a candidate whose memberships cannot be loaded is listed with the
 * other collections rather than breaking the sidebar.
 *
 * @returns the private collection, or undefined if there is none.
 */
export default function usePrivateCollection(): Collection | undefined {
  const { collections, memberships, groupMemberships } = useStores();
  const user = useCurrentUser();
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  const candidates = collections.allActive.filter((collection) =>
    isPrivateCollectionCandidate(collection)
  );
  const candidateIds = candidates.map((collection) => collection.id).join(",");

  useEffect(() => {
    let cancelled = false;

    for (const collectionId of candidateIds.split(",").filter(Boolean)) {
      void fetchIsSoleMember(
        { memberships, groupMemberships },
        collectionId,
        user.id
      )
        .catch(() => false)
        .then((isSoleMember) => {
          if (!cancelled) {
            setVerified((state) => ({
              ...state,
              [collectionId]: isSoleMember,
            }));
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [candidateIds, memberships, groupMemberships, user.id]);

  return findPrivateCollection(
    candidates,
    (collection) =>
      isExcludedCandidate(
        verified[collection.id],
        hasOtherMembers(
          { memberships, groupMemberships },
          collection.id,
          user.id
        ),
        candidates.length
      ),
    privateCollectionName(user.name)
  );
}

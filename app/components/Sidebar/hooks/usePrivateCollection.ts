// galadrim: Notion's "Private" section, without a schema change.
//
// The Notion importer puts each member's private pages into ONE private
// collection named "Privé – <Prénom Nom>" of which that member is the only
// member. The sidebar shows the documents of that collection directly under a
// "Privé" heading, and new unfiled documents are created in it.
//
// The collection is recognised by convention rather than by a flag:
// - it is private (`permission` is null),
// - its name starts with PRIVATE_COLLECTION_PREFIX,
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

/** The fields of a collection that the detection relies on. */
interface PrivateCollectionFields {
  /** The name of the collection. */
  name: string;
  /** Whether the collection is only accessible to its members. */
  isPrivate: boolean;
}

/** The stores needed to look up who a collection is shared with. */
type MembershipStores = Pick<RootStore, "memberships" | "groupMemberships">;

/**
 * Whether a collection looks like a member's private collection: private and
 * named with the importer's prefix. Membership is checked separately.
 *
 * @param collection The collection to test.
 * @returns true if the collection is a candidate.
 */
export function isPrivateCollectionCandidate(
  collection: PrivateCollectionFields
): boolean {
  return (
    collection.isPrivate &&
    collection.name.normalize("NFC").startsWith(PRIVATE_COLLECTION_PREFIX)
  );
}

/**
 * Picks the current user's private collection among the given collections.
 * When several qualify (eg. a trial import named "Privé – Name (test)") the
 * shortest name wins, then the given order; the others stay ordinary
 * collections.
 *
 * @param collections The collections to choose from, in display order.
 * @param isShared Returns true for a collection that someone else can access.
 * @returns the private collection, or undefined if there is none.
 */
export function findPrivateCollection<T extends PrivateCollectionFields>(
  collections: T[],
  isShared: (collection: T) => boolean
): T | undefined {
  return collections
    .filter(
      (collection) =>
        isPrivateCollectionCandidate(collection) && !isShared(collection)
    )
    .sort((a, b) => a.name.length - b.name.length)[0];
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
 * be verified is not used.
 *
 * @param stores The root store.
 * @param userId The current user.
 * @returns the private collection, or undefined if there is none.
 */
export async function resolvePrivateCollection(
  stores: Pick<RootStore, "collections" | "memberships" | "groupMemberships">,
  userId: string
): Promise<Collection | undefined> {
  if (!stores.collections.isLoaded) {
    await stores.collections.fetchAll();
  }

  const candidates = stores.collections.allActive.filter(
    isPrivateCollectionCandidate
  );
  const verified = await Promise.all(
    candidates.map((collection) =>
      fetchIsSoleMember(stores, collection.id, userId).catch(() => false)
    )
  );

  return findPrivateCollection(
    candidates,
    (collection) => !verified[candidates.indexOf(collection)]
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
 * must be a MobX observer.
 *
 * @returns the private collection, or undefined if there is none.
 */
export default function usePrivateCollection(): Collection | undefined {
  const { collections, memberships, groupMemberships } = useStores();
  const user = useCurrentUser();
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  const candidates = collections.allActive.filter(isPrivateCollectionCandidate);
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

  return findPrivateCollection(candidates, (collection) =>
    isExcludedCandidate(
      verified[collection.id],
      hasOtherMembers(
        { memberships, groupMemberships },
        collection.id,
        user.id
      ),
      candidates.length
    )
  );
}

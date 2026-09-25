import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";
import isUUID from "validator/lib/isUUID";
import type { NavigationNode } from "@shared/types";
import { UrlHelper } from "@shared/utils/UrlHelper";
import {
  AuthorizationError,
  InvalidRequestError,
  NotFoundError,
  PaymentRequiredError,
} from "@server/errors";
import type { User } from "@server/models";
import { Collection, Document, Share } from "@server/models";
import { authorize, can } from "@server/policies";

type LoadPublicShareProps = {
  id: string;
  collectionId?: string;
  documentId?: string;
  teamId?: string;
};

export async function loadPublicShare({
  id,
  collectionId,
  documentId,
  teamId,
}: LoadPublicShareProps) {
  const urlId =
    !isUUID(id) && UrlHelper.SHARE_URL_SLUG_REGEX.test(id) ? id : undefined;

  if (urlId && !teamId) {
    throw InvalidRequestError("teamId required for fetching share using urlId");
  }

  const where: WhereOptions<Share> = {
    revokedAt: {
      [Op.is]: null,
    },
    published: true,
  };

  if (urlId) {
    where.urlId = id;
    where.teamId = teamId;
  } else {
    where.id = id;
  }

  const share = await Share.findOne({
    where,
    include: [
      {
        model: Document.scope("withDrafts"),
        as: "document",
        include: [
          {
            model: Collection.scope("withDocumentStructure"),
            as: "collection",
            required: false,
          },
        ],
      },
      {
        model: Collection.scope("withDocumentStructure"),
        as: "collection",
      },
    ],
  });

  if (
    !share ||
    !!share.team.suspendedAt ||
    !!share.collection?.archivedAt ||
    !!share.document?.archivedAt
  ) {
    throw NotFoundError();
  }

  const isDraftWithoutCollection =
    !!share.document?.isDraft && !share.document.collectionId;
  const associatedCollection = share.collection ?? share.document?.collection;

  if (
    !share.team.sharing ||
    (!isDraftWithoutCollection && !associatedCollection?.sharing)
  ) {
    throw AuthorizationError();
  }

  let sharedTree: NavigationNode | null = null;
  let document: Document | null = null;

  if (share.collection) {
    sharedTree = associatedCollection?.toNavigationNode() ?? null;
  } else if (share.document && share.includeChildDocuments) {
    sharedTree =
      associatedCollection?.getDocumentTree(share.document.id) ?? null;
  }

  if (sharedTree && share.domain) {
    sharedTree.url = "";
  }

  if (collectionId && collectionId !== share.collectionId) {
    throw AuthorizationError();
  }

  if (documentId && documentId !== share.documentId) {
    document = await Document.findByPk(documentId, {
      rejectOnEmpty: true,
    });

    let isDocumentAccessible = share.documentId === document.id;

    if (share.includeChildDocuments) {
      const allIdsInSharedTree = getAllIdsInSharedTree(sharedTree);
      isDocumentAccessible =
        allIdsInSharedTree.includes(document.id) ||
        (await isRowPageInShare(document, share, allIdsInSharedTree));
    }

    if (!isDocumentAccessible) {
      throw AuthorizationError();
    }
  } else {
    document = share.document;
  }

  if (document?.isTrialImport) {
    throw PaymentRequiredError();
  }

  return {
    share,
    sharedTree,
    collection: share.collection,
    document,
  };
}

type LoadShareWithParentProps = {
  collectionId?: string;
  documentId?: string;
  user: User;
};

export async function loadShareWithParent({
  collectionId,
  documentId,
  user,
}: LoadShareWithParentProps) {
  const where: WhereOptions<Share> = {
    revokedAt: {
      [Op.is]: null,
    },
    teamId: user.teamId,
  };

  if (collectionId) {
    where.collectionId = collectionId;
  } else if (documentId) {
    where.documentId = documentId;
  }

  const share = await Share.scope({
    method: ["withCollectionPermissions", user.id],
  }).findOne({ where });

  if (!share) {
    throw NotFoundError();
  }

  authorize(user, "read", share);

  if (collectionId) {
    authorize(user, "read", share.collection);
  }

  let parentShare: Share | null = null;

  // Load the parent shares and return one (needed for share toggle in UI).
  // Parent share is needed for documents only since collections don't have parents.
  if (documentId) {
    authorize(user, "read", share.document);

    const docCollectionId = share.document.collectionId;

    if (!docCollectionId) {
      throw NotFoundError("Collection not found for the shared document");
    }

    const docCollection = await Collection.findByPk(docCollectionId, {
      userId: user.id,
      includeDocumentStructure: true,
      rejectOnEmpty: true,
    });

    const collectionShare = await Share.scope({
      method: ["withCollectionPermissions", user.id],
    }).findOne({
      where: {
        revokedAt: {
          [Op.is]: null,
        },
        published: true,
        teamId: user.teamId,
        collectionId: docCollectionId,
      },
    });

    // prefer collection share if it exists and user has read access.
    if (collectionShare && can(user, "read", collectionShare)) {
      parentShare = collectionShare;
    } else {
      const parentDocIds = await getDocumentParentIds(
        docCollection,
        share.document
      );

      const allParentShares = parentDocIds
        ? await Share.scope({
            method: ["withCollectionPermissions", user.id],
          }).findAll({
            where: {
              revokedAt: {
                [Op.is]: null,
              },
              published: true,
              teamId: user.teamId,
              includeChildDocuments: true,
              documentId: parentDocIds,
            },
          })
        : null;

      parentShare = allParentShares?.find((s) => can(user, "read", s)) ?? null;
    }
  }

  return { share, parentShare };
}

/**
 * Recursively extracts all document IDs from a shared tree navigation node.
 *
 * @param sharedTree The navigation node representing the shared tree.
 * @returns Array of all document IDs in the tree.
 */
export function getAllIdsInSharedTree(
  sharedTree: NavigationNode | null
): string[] {
  if (!sharedTree) {
    return [];
  }

  const ids = [sharedTree.id];
  for (const child of sharedTree.children) {
    ids.push(...getAllIdsInSharedTree(child));
  }
  return ids;
}

/**
 * Whether a database row page belongs to a share. Row pages are not in the
 * document tree, so they belong to the share of the page their database lives
 * in, found through their chain of parents.
 *
 * @param document the requested document.
 * @param share the share it is requested through.
 * @param idsInSharedTree the ids of the documents in the shared tree.
 * @returns true when the document is a row page under the shared tree.
 */
async function isRowPageInShare(
  document: Document,
  share: Share,
  idsInSharedTree: string[]
): Promise<boolean> {
  if (!document.databaseId) {
    return false;
  }
  if (share.collectionId) {
    return document.collectionId === share.collectionId && !document.archivedAt;
  }

  const ancestorIds = await getRowPageAncestorIds(document);
  return ancestorIds.some(
    (id) => id === share.documentId || idsInSharedTree.includes(id)
  );
}

/**
 * Returns the ids of the documents above a document, from the collection
 * root down to its parent, including when the document is a database row page
 * that the collection's tree does not hold.
 *
 * @param collection the collection with its document structure loaded.
 * @param document the document.
 * @returns the ids of the ancestors, or undefined when none can be found.
 */
async function getDocumentParentIds(
  collection: Collection,
  document: Document
): Promise<string[] | undefined> {
  if (!document.databaseId) {
    return collection.getDocumentParents(document.id) || undefined;
  }

  const ancestorIds = await getRowPageAncestorIds(document);
  const topId = ancestorIds[ancestorIds.length - 1];
  const treeParentIds = topId
    ? (collection.getDocumentParents(topId) ?? [])
    : [];
  return [...treeParentIds, ...ancestorIds.reverse()];
}

/**
 * Walks up from a database row page to the first ancestor that is not a row
 * page itself, which is where the page would sit in the document tree.
 *
 * @param document the row page.
 * @returns the ids of the ancestors, nearest first.
 */
async function getRowPageAncestorIds(document: Document): Promise<string[]> {
  const ids: string[] = [];
  let current: Pick<Document, "databaseId" | "parentDocumentId"> | null =
    document;

  while (
    current?.databaseId &&
    current.parentDocumentId &&
    !ids.includes(current.parentDocumentId)
  ) {
    ids.push(current.parentDocumentId);
    current = await Document.unscoped().findOne({
      attributes: ["id", "databaseId", "parentDocumentId"],
      where: { id: current.parentDocumentId },
    });
  }

  return ids;
}

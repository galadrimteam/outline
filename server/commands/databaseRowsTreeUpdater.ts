import type { Transaction } from "sequelize";
import { Op } from "sequelize";
import type { NavigationNode } from "@shared/types";
import type { Database } from "@server/models";
import { Collection, Document } from "@server/models";

/**
 * Brings the collection's tree in line with where a database keeps its row
 * pages: when it keeps them in the tree, the row pages that are not there are
 * added under their parent with their sub-pages, oldest first; otherwise the
 * row pages are taken out, their sub-pages with them. One save. A row page
 * whose parent is not in the tree stays out of it.
 *
 * @param database the database, with its current settings.
 * @param options.transaction the transaction to work in.
 * @returns the number of row pages added to or taken out of the tree.
 */
export async function databaseRowsTreeUpdater(
  database: Database,
  { transaction }: { transaction: Transaction }
): Promise<number> {
  const collection = await Collection.findByPk(database.collectionId, {
    includeDocumentStructure: true,
    transaction,
    lock: transaction.LOCK.NO_KEY_UPDATE,
  });
  if (!collection?.documentStructure) {
    return 0;
  }

  const rowPages = await Document.unscoped().findAll({
    where: {
      databaseId: database.id,
      collectionId: database.collectionId,
      publishedAt: { [Op.ne]: null },
      archivedAt: { [Op.is]: null },
    },
    order: [["createdAt", "ASC"]],
    transaction,
  });

  let changed = 0;
  if (database.rowsInSidebar) {
    for (const page of rowPages) {
      if (collection.getDocumentTree(page.id)) {
        continue;
      }
      await collection.addDocumentToStructure(page, undefined, {
        transaction,
        save: false,
      });
      changed += collection.getDocumentTree(page.id) ? 1 : 0;
    }
  } else {
    const inTree = new Set(
      rowPages
        .map((page) => page.id)
        .filter((id) => collection.getDocumentTree(id))
    );
    collection.documentStructure = withoutNodes(
      collection.documentStructure,
      inTree
    );
    changed = inTree.size;
  }

  if (changed) {
    collection.changed("documentStructure", true);
    await collection.save({ fields: ["documentStructure"], transaction });
  }
  return changed;
}

/**
 * Returns a tree without the given nodes, their children going with them.
 *
 * @param nodes the tree.
 * @param ids the ids of the nodes to take out.
 * @returns the tree without them.
 */
export function withoutNodes(
  nodes: NavigationNode[],
  ids: Set<string>
): NavigationNode[] {
  return nodes
    .filter((node) => !ids.has(node.id))
    .map((node) => ({ ...node, children: withoutNodes(node.children, ids) }));
}

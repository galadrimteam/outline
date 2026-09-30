import { Node } from "prosemirror-model";
import type { ProsemirrorData } from "@shared/types";
import { createContext } from "@server/context";
import { schema } from "@server/editor";
import type { Database, User } from "@server/models";
import { Document, Revision } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { sequelize } from "@server/storage/database";

/** The header row the migration writes above a row page's properties (deploy/migrator/dbrows.py, TABLE_HEAD). */
const Header = ["propriété", "valeur"];

/** How many leading blocks may come before the table: an empty paragraph or two left by the import. */
const LeadingBlocks = 3;

/**
 * Returns a row page's content without the « Propriété | Valeur » table the migration wrote under its title, once
 * the page is a database row whose properties panel shows the same values. Only a table whose every property is a
 * field of the database goes; anything else is left alone.
 *
 * @param content the page's content.
 * @param fieldNames the names of the database's fields.
 * @returns the content without the table, or null when there is no such table.
 */
export function withoutPropertyTable(
  content: ProsemirrorData,
  fieldNames: Iterable<string>
): ProsemirrorData | null {
  const names = new Set([...fieldNames].map(normalize));
  const blocks = content.content ?? [];
  const index = blocks
    .slice(0, LeadingBlocks + 1)
    .findIndex((block) => block.type === "table");
  if (index === -1 || !blocks.slice(0, index).every(isEmptyParagraph)) {
    return null;
  }
  const rows = (blocks[index].content ?? []).map((row) =>
    (row.content ?? []).map((cell) => normalize(textOf(cell)))
  );
  const [header, ...properties] = rows;
  if (
    !header ||
    header.length !== 2 ||
    header[0] !== Header[0] ||
    header[1] !== Header[1] ||
    !properties.length ||
    !properties.every((cells) => names.has(cells[0]))
  ) {
    return null;
  }
  return {
    ...content,
    content: blocks.filter((_, position) => position !== index),
  };
}

/**
 * Removes the property table of row pages just linked to a database, keeping each page's previous state as a
 * revision. The collaborative state follows, so open editors see the change.
 *
 * @param user the admin running the migration.
 * @param database the database the pages are rows of.
 * @param documentIds the pages.
 * @param fieldNames the names of the database's fields.
 * @returns the number of pages changed.
 */
export async function removeRowPropertyTables(
  user: User,
  database: Database,
  documentIds: string[],
  fieldNames: string[]
): Promise<number> {
  let changed = 0;
  for (const documentId of documentIds) {
    const done = await sequelize.transaction(async (transaction) => {
      await sequelize.query(`SET LOCAL lock_timeout = '5s';`, { transaction });
      const document = await Document.unscoped().findOne({
        where: { id: documentId, databaseId: database.id },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (!document) {
        return false;
      }
      const content = withoutPropertyTable(
        await DocumentHelper.toJSON(document),
        fieldNames
      );
      if (!content) {
        return false;
      }
      const ctx = createContext({ user, transaction });
      await Revision.createFromDocument(ctx, document);
      DocumentHelper.applyProsemirrorToDocument(
        document,
        Node.fromJSON(schema, content)
      );
      await document.save({ ...ctx.context, silent: true });
      return true;
    });
    if (done) {
      changed += 1;
    }
  }
  return changed;
}

function textOf(node: ProsemirrorData): string {
  if (node.type === "text") {
    return node.text ?? "";
  }
  return (node.content ?? []).map(textOf).join("");
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function isEmptyParagraph(node: ProsemirrorData): boolean {
  return node.type === "paragraph" && !textOf(node).trim();
}

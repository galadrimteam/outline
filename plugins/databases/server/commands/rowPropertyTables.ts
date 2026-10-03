import type { ProsemirrorData } from "@shared/types";
import { firstContentIndex, textOf } from "../utils/rowPageBlocks";

/** The header row the migration writes above a row page's properties (deploy/migrator/dbrows.py, TABLE_HEAD). */
const Header = ["propriété", "valeur"];

/**
 * Returns a row page's content without the « Propriété | Valeur » table the migration wrote under its title, once
 * the page is a database row whose properties panel shows the same values. Only that table goes: the first block of
 * the body (empty paragraphs and the page's cover may come before it), headed « Propriété | Valeur », every property
 * a field of the database. Anything else is left alone.
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
  const index = firstContentIndex(blocks);
  if (blocks[index]?.type !== "table") {
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

function normalize(text: string): string {
  return text.normalize("NFC").trim().toLowerCase();
}

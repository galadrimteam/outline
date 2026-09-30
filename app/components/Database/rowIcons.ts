import type {
  DatabaseLinkValue,
  DatabaseRecord,
  DatabaseSettings,
} from "@shared/databases/types";

/** An icon drawn before a row's title: an emoji, a custom emoji or an icon name. */
export interface RowIconValue {
  value: string;
  /** The colour of an icon name. */
  color?: string;
}

/** What a row's page tells about its icon. */
interface PageLook {
  icon?: string | null;
  color?: string | null;
}

/**
 * The icon a row shows before its title, as in Notion: the icon of its page,
 * else the emoji kept in the database's icon property.
 *
 * @param database the database, for its icon property.
 * @param record the row.
 * @param page the row's page when it is loaded, fresher than the row.
 * @returns the icon, or undefined when the row has none.
 */
export function rowIcon(
  database: { settings?: DatabaseSettings | null },
  record: Pick<DatabaseRecord, "fields" | "documentId" | "icon" | "iconColor">,
  page?: PageLook
): RowIconValue | undefined {
  const look: PageLook | undefined = record.documentId
    ? (page ?? { icon: record.icon, color: record.iconColor })
    : undefined;
  if (look?.icon) {
    return { value: look.icon, color: look.color ?? undefined };
  }
  const fieldId = database.settings?.iconFieldId;
  const cell = fieldId ? record.fields[fieldId] : undefined;
  return typeof cell === "string" && cell.trim()
    ? { value: cell.trim() }
    : undefined;
}

/**
 * The icon a relation shows before the linked row's title: the icon of that
 * row's page.
 *
 * @param link the relation value.
 * @returns the icon, or undefined when the linked row's page has none.
 */
export function linkIcon(link: DatabaseLinkValue): RowIconValue | undefined {
  return link.icon
    ? { value: link.icon, color: link.iconColor ?? undefined }
    : undefined;
}

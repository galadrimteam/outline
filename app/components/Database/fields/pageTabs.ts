import type { DatabaseField, DatabasePageTab } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";

/** The tab showing the page's own body. */
export interface ContentPageTab {
  kind: "content";
  id: string;
  name: string;
}

/** A tab showing the rows a relation field of the row links to. */
export interface RelationPageTab {
  kind: "relation";
  id: string;
  name: string;
  /** The relation field of the row's database. */
  field: DatabaseField;
  /** The fields of the linked database shown as columns, in order. */
  visibleFieldIds: string[];
}

/** A tab of a row page, resolved against the fields of its database. */
export type RowPageTab = ContentPageTab | RelationPageTab;

/**
 * The tabs a row page shows: those of the page layout whose relation field still exists, with
 * their default names. A page left with no relation tab shows no tab bar, so the result is then
 * empty; otherwise it always holds one content tab, so the body stays reachable.
 *
 * @param tabs the tabs of the page layout.
 * @param fields the fields of the row's database.
 * @param contentName the name of a content tab without one.
 * @returns the tabs, in order, or none.
 */
export function rowPageTabs(
  tabs: DatabasePageTab[] | undefined,
  fields: DatabaseField[],
  contentName: string
): RowPageTab[] {
  const resolved: RowPageTab[] = [];
  const seen = new Set<string>();

  for (const tab of tabs ?? []) {
    if (seen.has(tab.id)) {
      continue;
    }
    const name = tab.name?.trim();
    if (tab.kind === "content") {
      if (resolved.some((item) => item.kind === "content")) {
        continue;
      }
      resolved.push({ kind: "content", id: tab.id, name: name || contentName });
      seen.add(tab.id);
      continue;
    }
    const field = fields.find(
      (item) => item.id === tab.fieldId && item.type === DatabaseFieldType.Link
    );
    if (!field) {
      continue;
    }
    resolved.push({
      kind: "relation",
      id: tab.id,
      name: name || field.name,
      field,
      visibleFieldIds: tab.visibleFieldIds ?? [],
    });
    seen.add(tab.id);
  }

  if (!resolved.some((tab) => tab.kind === "relation")) {
    return [];
  }
  if (!resolved.some((tab) => tab.kind === "content")) {
    resolved.unshift({ kind: "content", id: "content", name: contentName });
  }
  return resolved;
}

/**
 * The columns of a relation tab after its title: the chosen fields of the linked database that
 * exist, in order, without its primary field (the title column) nor its icon field.
 *
 * @param fields the fields of the linked database.
 * @param visibleFieldIds the fields chosen by the tab.
 * @param iconFieldId the field holding the linked rows' emoji.
 * @returns the fields, in order.
 */
export function relationTabColumns(
  fields: DatabaseField[],
  visibleFieldIds: string[],
  iconFieldId?: string
): DatabaseField[] {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const columns: DatabaseField[] = [];
  for (const id of new Set(visibleFieldIds)) {
    const field = byId.get(id);
    if (field && !field.isPrimary && field.id !== iconFieldId) {
      columns.push(field);
    }
  }
  return columns;
}

/**
 * The tab a key moves to in a tab bar, the arrows wrapping around.
 *
 * @param key the key pressed.
 * @param index the selected tab.
 * @param count the number of tabs.
 * @returns the tab to select and focus, or undefined when the key does not move.
 */
export function focusedTabIndex(
  key: string,
  index: number,
  count: number
): number | undefined {
  if (!count) {
    return undefined;
  }
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

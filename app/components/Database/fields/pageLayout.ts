import type {
  DatabaseField,
  DatabasePageDiscussions,
  DatabaseRecord,
  DatabaseSettings,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { isEmptyCellValue } from "../cells/format";
import { orderedFields } from "../toolbar/columns";

/** Row page customisation (Notion's "Customize page"). */
export type PageLayout = NonNullable<DatabaseSettings["pageLayout"]>;

/** How a property shows on row pages. */
export type PropertyVisibility = "always" | "hideWhenEmpty" | "hidden";

/** The properties of a row page, split into shown and hidden. */
export interface PageProperties {
  shown: DatabaseField[];
  hidden: DatabaseField[];
  /**
   * Whether the shown properties are the pinned ones of Notion's page layout, every other one
   * waiting behind « Show details ».
   */
  pinned: boolean;
}

/**
 * The properties listed on a row page, without the title and the icon, which the page header
 * shows, nor the end field of a date range, which shows with its start as one property, nor the
 * columns the layout omits. They follow the page order of the layout (Notion's own page order),
 * then the order of the database's first table for the properties it does not list.
 *
 * @param fields the database fields.
 * @param views the database views.
 * @param iconFieldId the field holding the row emoji.
 * @param layout the page layout of the database, if any.
 * @returns the properties in order.
 */
export function pageFields(
  fields: DatabaseField[],
  views: DatabaseView[],
  iconFieldId?: string,
  layout?: PageLayout
): DatabaseField[] {
  const ordered = [...views].sort((a, b) => a.order - b.order);
  const reference =
    ordered.find((view) => view.layout === DatabaseLayout.Table) ?? ordered[0];
  const sorted = byPageOrder(
    reference ? orderedFields(fields, reference) : fields,
    layout?.fieldOrder
  );
  const left = new Set([
    ...fields.flatMap((field) =>
      field.meta?.endFieldId ? [field.meta.endFieldId] : []
    ),
    ...(layout?.omittedFieldIds ?? []),
  ]);
  return sorted.filter(
    (field) =>
      !field.isPrimary && field.id !== iconFieldId && !left.has(field.id)
  );
}

/**
 * How the discussions of a page show under its title: the « Page discussions » of its database
 * for a row page, else as Notion shows those of any page, only when there are some.
 *
 * @param layout the page layout of the database of a row page, undefined for another page.
 * @returns the setting.
 */
export function pageDiscussions(
  layout: PageLayout | undefined
): DatabasePageDiscussions {
  return layout?.discussions ?? "minimal";
}

/**
 * How a property shows on row pages.
 *
 * @param layout the page layout of the database.
 * @param fieldId the property.
 * @returns its visibility.
 */
export function propertyVisibility(
  layout: PageLayout | undefined,
  fieldId: string
): PropertyVisibility {
  if (layout?.hiddenFieldIds?.includes(fieldId)) {
    return "hidden";
  }
  if (layout?.hideWhenEmptyFieldIds?.includes(fieldId)) {
    return "hideWhenEmpty";
  }
  return "always";
}

/**
 * The page layout after a property changes visibility.
 *
 * @param layout the page layout of the database.
 * @param fieldId the property.
 * @param visibility its new visibility.
 * @returns the new page layout.
 */
export function withPropertyVisibility(
  layout: PageLayout | undefined,
  fieldId: string,
  visibility: PropertyVisibility
): PageLayout {
  const hidden = (layout?.hiddenFieldIds ?? []).filter((id) => id !== fieldId);
  const whenEmpty = (layout?.hideWhenEmptyFieldIds ?? []).filter(
    (id) => id !== fieldId
  );
  if (visibility === "hidden") {
    hidden.push(fieldId);
  }
  if (visibility === "hideWhenEmpty") {
    whenEmpty.push(fieldId);
  }
  return {
    ...layout,
    hiddenFieldIds: hidden,
    hideWhenEmptyFieldIds: whenEmpty,
  };
}

/**
 * Splits the properties of a row page into shown and hidden, after the page layout and the values
 * of the row.
 *
 * @param fields the properties, in order.
 * @param record the row, when loaded.
 * @param layout the page layout of the database.
 * @returns the shown and the hidden properties.
 */
export function splitPageProperties(
  fields: DatabaseField[],
  record: DatabaseRecord | undefined,
  layout: PageLayout | undefined
): PageProperties {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const pinned = (layout?.pinnedFieldIds ?? []).flatMap((id) => {
    const field = byId.get(id);
    return field ? [field] : [];
  });
  if (pinned.length) {
    return {
      shown: pinned,
      hidden: fields.filter((field) => !pinned.includes(field)),
      pinned: true,
    };
  }

  const shown: DatabaseField[] = [];
  const hidden: DatabaseField[] = [];

  for (const field of fields) {
    const visibility = propertyVisibility(layout, field.id);
    const empty = isEmptyCellValue(record?.fields[field.id]);
    const hide =
      visibility === "hidden" ||
      (empty && (visibility === "hideWhenEmpty" || !!layout?.hideEmpty));
    (hide ? hidden : shown).push(field);
  }

  return { shown, hidden, pinned: false };
}

function byPageOrder(
  fields: DatabaseField[],
  fieldOrder: string[] | undefined
): DatabaseField[] {
  if (!fieldOrder?.length) {
    return fields;
  }
  const rank = new Map(fieldOrder.map((id, index) => [id, index]));
  const last = fieldOrder.length;
  return [...fields].sort(
    (a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last)
  );
}

import type {
  DatabaseCellValueType,
  DatabaseColumnMeta,
  DatabaseEngineViewType,
  DatabaseField,
  DatabaseFieldOptions,
  DatabaseFilter,
  DatabaseFilterItem,
  DatabaseView,
  DatabaseViewOptions,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { layoutForViewType } from "../../utils/layouts";
import type { EngineFieldRow, EngineViewRow } from "./types";

/** A link's relationship, as Teable names it. */
export type LinkRelationship = NonNullable<
  DatabaseFieldOptions["relationship"]
>;

/** Field types whose cells are computed, never written. */
const computedTypes = new Set<DatabaseFieldType>([
  DatabaseFieldType.Formula,
  DatabaseFieldType.Rollup,
  DatabaseFieldType.ConditionalRollup,
  DatabaseFieldType.AutoNumber,
  DatabaseFieldType.CreatedTime,
  DatabaseFieldType.LastModifiedTime,
  DatabaseFieldType.CreatedBy,
  DatabaseFieldType.LastModifiedBy,
]);

/** View types that show a field only when its column says `visible`. */
const flagVisibilityTypes = new Set<DatabaseEngineViewType>([
  "kanban",
  "gallery",
  "calendar",
  "form",
]);

/** Colors given to the choices a conversion to a select adds, in turn. */
const choiceColors = [
  "blueBright",
  "cyanBright",
  "tealBright",
  "greenBright",
  "yellowBright",
  "orangeBright",
  "redBright",
  "pinkBright",
  "purpleBright",
  "grayBright",
];

/** View options that name a field, cleared when that field goes. */
const fieldOptionKeys = [
  "stackFieldId",
  "coverFieldId",
  "startDateFieldId",
  "endDateFieldId",
  "titleFieldId",
  "frozenFieldId",
] as const;

/**
 * Returns the neutral shape of a stored field.
 *
 * @param row the stored field.
 * @returns the field.
 */
export function toDatabaseField(row: EngineFieldRow): DatabaseField {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description ?? null,
    options: row.options ?? {},
    lookupOptions: row.lookupOptions ?? null,
    isPrimary: row.isPrimary,
    isComputed: row.isComputed,
    isLookup: row.isLookup,
    cellValueType: row.cellValueType,
    isMultipleCellValue: row.isMultipleCellValue,
  };
}

/**
 * Returns the neutral shape of a stored view, without Outline's overrides.
 *
 * @param row the stored view.
 * @returns the view.
 */
export function toDatabaseView(row: EngineViewRow): DatabaseView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    layout: layoutForViewType(row.type),
    order: row.order,
    description: row.description ?? null,
    filter: row.filter ?? null,
    sort: row.sort ?? null,
    group: row.group ?? null,
    columnMeta: row.columnMeta ?? {},
    options: row.options ?? {},
    overrides: {},
    isLocked: row.isLocked,
  };
}

/**
 * Tells whether a field type is computed.
 *
 * @param type the field type.
 * @returns true for formulas, rollups and the record's own metadata.
 */
export function isComputedType(type: DatabaseFieldType): boolean {
  return computedTypes.has(type);
}

/**
 * Tells whether a field's cells are never written: computed or looked up.
 *
 * @param field the field.
 * @returns true when the field cannot be written.
 */
export function isReadOnlyField(
  field: Pick<EngineFieldRow, "isComputed" | "isLookup">
): boolean {
  return field.isComputed || field.isLookup;
}

/**
 * Returns what the cells of a stored field hold, as Teable types them.
 *
 * @param type the field type.
 * @param options the field options.
 * @returns the cell value type and whether a cell holds several values.
 */
export function storedCellType(
  type: DatabaseFieldType,
  options: DatabaseFieldOptions
): { cellValueType: DatabaseCellValueType; isMultipleCellValue: boolean } {
  switch (type) {
    case DatabaseFieldType.Number:
    case DatabaseFieldType.Rating:
    case DatabaseFieldType.AutoNumber:
      return { cellValueType: "number", isMultipleCellValue: false };
    case DatabaseFieldType.Checkbox:
      return { cellValueType: "boolean", isMultipleCellValue: false };
    case DatabaseFieldType.Date:
    case DatabaseFieldType.CreatedTime:
    case DatabaseFieldType.LastModifiedTime:
      return { cellValueType: "dateTime", isMultipleCellValue: false };
    case DatabaseFieldType.MultipleSelect:
    case DatabaseFieldType.Attachment:
      return { cellValueType: "string", isMultipleCellValue: true };
    case DatabaseFieldType.User:
      return {
        cellValueType: "string",
        isMultipleCellValue: !!options.isMultiple,
      };
    case DatabaseFieldType.Link:
      return {
        cellValueType: "string",
        isMultipleCellValue: isMultipleRelationship(options.relationship),
      };
    default:
      return { cellValueType: "string", isMultipleCellValue: false };
  }
}

/**
 * Tells whether a link cell of this relationship holds several records.
 *
 * @param relationship the link's relationship, manyMany when not set.
 * @returns true for manyMany and oneMany.
 */
export function isMultipleRelationship(
  relationship: LinkRelationship | undefined
): boolean {
  return (
    relationship === undefined ||
    relationship === "manyMany" ||
    relationship === "oneMany"
  );
}

/**
 * Returns the relationship of a link's symmetric field.
 *
 * @param relationship the link's relationship.
 * @returns the relationship seen from the other table.
 */
export function reverseRelationship(
  relationship: LinkRelationship | undefined
): LinkRelationship {
  switch (relationship) {
    case "oneMany":
      return "manyOne";
    case "manyOne":
      return "oneMany";
    case "oneOne":
      return "oneOne";
    default:
      return "manyMany";
  }
}

/**
 * Returns a name not taken yet, the way Teable numbers copies: « Name »,
 * then « Name 2 », « Name 3 »…
 *
 * @param name the wanted name.
 * @param taken the names already used.
 * @returns the name, numbered when needed.
 */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) {
    return name;
  }
  let base = name;
  let num = 2;
  if (isNaN(Number(name))) {
    const match = name.match(/^(.*)(\b\d+)$/);
    if (match) {
      base = match[1].trim();
      num = parseInt(match[2], 10);
    }
  }
  while (taken.includes(`${base} ${num}`)) {
    num++;
  }
  return `${base} ${num}`;
}

/**
 * Tells whether a view type shows a field only when its column says so.
 *
 * @param type the view type.
 * @returns true for board, gallery, calendar and form views.
 */
export function showsFlaggedFieldsOnly(type: DatabaseEngineViewType): boolean {
  return flagVisibilityTypes.has(type);
}

/**
 * Returns the columns of a new view, as Teable fills them: every field in
 * its order (the primary first); the primary shown on cards and calendars,
 * every writable field on a form.
 *
 * @param type the view type.
 * @param fields the table's fields.
 * @returns the column meta, keyed by field id.
 */
export function defaultColumnMeta(
  type: DatabaseEngineViewType,
  fields: EngineFieldRow[]
): Record<string, DatabaseColumnMeta> {
  const ordered = [
    ...fields.filter((field) => field.isPrimary),
    ...fields.filter((field) => !field.isPrimary),
  ];
  const columnMeta: Record<string, DatabaseColumnMeta> = {};
  ordered.forEach((field, index) => {
    const meta: DatabaseColumnMeta = { order: index };
    if (
      (type === "form" &&
        !isReadOnlyField(field) &&
        field.type !== DatabaseFieldType.Button) ||
      (showsFlaggedFieldsOnly(type) && type !== "form" && field.isPrimary)
    ) {
      meta.visible = true;
    }
    columnMeta[field.id] = meta;
  });
  return columnMeta;
}

/**
 * Returns the options a new view starts with besides the given ones: the
 * first attachment as a gallery's cover, the first date fields as a
 * calendar's start and end.
 *
 * @param type the view type.
 * @param fields the table's fields.
 * @param options the options given.
 * @returns the options.
 */
export function defaultViewOptions(
  type: DatabaseEngineViewType,
  fields: EngineFieldRow[],
  options: DatabaseViewOptions = {}
): DatabaseViewOptions {
  if (type === "gallery" && !options.coverFieldId) {
    const cover = fields.find(
      (field) => field.type === DatabaseFieldType.Attachment
    );
    return cover ? { ...options, coverFieldId: cover.id } : options;
  }
  if (type === "calendar") {
    const dates = fields.filter(
      (field) =>
        field.cellValueType === "dateTime" && !field.isMultipleCellValue
    );
    if (!dates.length) {
      return options;
    }
    const startDateFieldId = options.startDateFieldId ?? dates[0].id;
    return {
      ...options,
      startDateFieldId,
      endDateFieldId:
        options.endDateFieldId ?? dates[1]?.id ?? startDateFieldId,
    };
  }
  return options;
}

/**
 * Returns a view once fields are gone from its table: their columns, sorts,
 * groupings, filter conditions and the options naming them removed.
 *
 * @param view the view.
 * @param fieldIds the removed fields.
 * @returns the view, the same object when nothing named those fields.
 */
export function viewWithoutFields(
  view: EngineViewRow,
  fieldIds: ReadonlySet<string>
): EngineViewRow {
  const columnMeta = Object.fromEntries(
    Object.entries(view.columnMeta ?? {}).filter(([id]) => !fieldIds.has(id))
  );
  const sortObjs = (view.sort?.sortObjs ?? []).filter(
    (item) => !fieldIds.has(item.fieldId)
  );
  const group = (view.group ?? []).filter(
    (item) => !fieldIds.has(item.fieldId)
  );
  const options: DatabaseViewOptions = { ...view.options };
  for (const key of fieldOptionKeys) {
    const value = options[key];
    if (value && fieldIds.has(value)) {
      delete options[key];
    }
  }
  if (
    options.colorConfig?.fieldId &&
    fieldIds.has(options.colorConfig.fieldId)
  ) {
    delete options.colorConfig;
  }
  const filter = view.filter ? filterWithout(view.filter, fieldIds) : null;

  const next: EngineViewRow = {
    ...view,
    columnMeta,
    sort: view.sort
      ? sortObjs.length || view.sort.manualSort
        ? { ...view.sort, sortObjs }
        : null
      : null,
    group: view.group ? (group.length ? group : null) : null,
    filter: filter?.filterSet.length ? filter : null,
    options,
  };
  return JSON.stringify(next) === JSON.stringify(view) ? view : next;
}

/**
 * Returns the columns of a view with a new field appended after the others,
 * shown when the view is the one the field was added from.
 *
 * @param view the view.
 * @param fieldId the new field.
 * @param visible whether a board, gallery, calendar or form shows it.
 * @returns the column meta.
 */
export function withAppendedColumn(
  view: EngineViewRow,
  fieldId: string,
  visible: boolean
): Record<string, DatabaseColumnMeta> {
  const orders = Object.values(view.columnMeta ?? {}).map((meta) => meta.order);
  const meta: DatabaseColumnMeta = {
    order: orders.length ? Math.max(...orders) + 1 : 0,
  };
  if (visible && showsFlaggedFieldsOnly(view.type)) {
    meta.visible = true;
  }
  return { ...view.columnMeta, [fieldId]: meta };
}

/**
 * Returns the choices a select needs, adding the missing names after the
 * existing ones with colors in turn.
 *
 * @param options the select's options.
 * @param names the choice names its values need.
 * @returns the options with every name among its choices.
 */
export function withChoices(
  options: DatabaseFieldOptions,
  names: string[]
): DatabaseFieldOptions {
  const choices = [...(options.choices ?? [])];
  const known = new Set(choices.map((choice) => choice.name));
  for (const name of names) {
    if (!name || known.has(name)) {
      continue;
    }
    known.add(name);
    choices.push({
      name,
      color: choiceColors[choices.length % choiceColors.length],
    });
  }
  return { ...options, choices };
}

function filterWithout(
  filter: DatabaseFilter,
  fieldIds: ReadonlySet<string>
): DatabaseFilter {
  const filterSet: (DatabaseFilterItem | DatabaseFilter)[] = [];
  for (const item of filter.filterSet) {
    if ("filterSet" in item) {
      const nested = filterWithout(item, fieldIds);
      if (nested.filterSet.length) {
        filterSet.push(nested);
      }
    } else if (!fieldIds.has(item.fieldId)) {
      filterSet.push(item);
    }
  }
  return { ...filter, filterSet };
}

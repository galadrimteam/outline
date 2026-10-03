/**
 * Engine-neutral shapes of a database (a table of rows shown as table, board,
 * calendar… views). The server's DatabaseEngine maps an external engine
 * (Teable today) onto them; the app and the MCP tools only ever see these.
 * Field types, filter operators and view options keep Teable's vocabulary so
 * that the Teable engine is a thin mapping, not a translation layer.
 */

export enum DatabaseFieldType {
  SingleLineText = "singleLineText",
  LongText = "longText",
  Number = "number",
  Rating = "rating",
  Checkbox = "checkbox",
  SingleSelect = "singleSelect",
  MultipleSelect = "multipleSelect",
  Date = "date",
  User = "user",
  Attachment = "attachment",
  Link = "link",
  Rollup = "rollup",
  ConditionalRollup = "conditionalRollup",
  Formula = "formula",
  AutoNumber = "autoNumber",
  CreatedTime = "createdTime",
  LastModifiedTime = "lastModifiedTime",
  CreatedBy = "createdBy",
  LastModifiedBy = "lastModifiedBy",
  Button = "button",
}

/** How a view is drawn. Teable stores table/board/calendar/gallery/form natively, list and timeline are Outline overlays on a grid view. */
export enum DatabaseLayout {
  Table = "table",
  Board = "board",
  Calendar = "calendar",
  Gallery = "gallery",
  List = "list",
  Timeline = "timeline",
  Form = "form",
}

/** The engine's own view type. */
export type DatabaseEngineViewType =
  | "grid"
  | "kanban"
  | "calendar"
  | "gallery"
  | "form"
  | "plugin";

export type DatabaseCellValueType =
  | "string"
  | "number"
  | "boolean"
  | "dateTime";

export interface DatabaseSelectChoice {
  id?: string;
  name: string;
  color: string;
}

export interface DatabaseFieldFormatting {
  type?: "decimal" | "percent" | "currency";
  precision?: number;
  symbol?: string;
  date?: string;
  time?: string;
  timeZone?: string;
}

/** Options of a field; which keys are set depends on the field type. */
export interface DatabaseFieldOptions {
  choices?: DatabaseSelectChoice[];
  defaultValue?: string | number | boolean | string[] | null;
  formatting?: DatabaseFieldFormatting;
  showAs?: { type: string; [key: string]: string | number | boolean };
  isMultiple?: boolean;
  shouldNotify?: boolean;
  foreignTableId?: string;
  /** The Outline database of the linked table, filled by the server; set it to create a link. */
  foreignDatabaseId?: string;
  baseId?: string;
  relationship?: "oneOne" | "oneMany" | "manyOne" | "manyMany";
  lookupFieldId?: string;
  symmetricFieldId?: string;
  isOneWay?: boolean;
  expression?: string;
  timeZone?: string;
  max?: number;
  icon?: string;
  color?: string;
  label?: string;
}

/** Status groups of a Notion-like status field, kept by Outline next to a single select. */
export enum DatabaseStatusGroup {
  ToDo = "to_do",
  InProgress = "in_progress",
  Complete = "complete",
}

/** What Outline adds to a field the engine does not know about. */
export interface DatabaseFieldMeta {
  /** Choice name → status group, when the single select is a Notion status. */
  statusGroups?: Record<string, DatabaseStatusGroup>;
  /** The field holding the end of a date range whose start is this field. */
  endFieldId?: string;
  /** The icon shown instead of the type icon: an emoji, an icon name or a custom emoji id. */
  icon?: string;
}

/** Where a lookup field or a rollup reads: through a link of its table, a field of the linked table. */
export interface DatabaseLookupOptions {
  foreignTableId: string;
  linkFieldId: string;
  lookupFieldId: string;
}

export interface DatabaseField {
  id: string;
  name: string;
  type: DatabaseFieldType;
  description?: string | null;
  options: DatabaseFieldOptions;
  lookupOptions?: DatabaseLookupOptions | null;
  isPrimary: boolean;
  isComputed: boolean;
  isLookup: boolean;
  cellValueType: DatabaseCellValueType;
  isMultipleCellValue: boolean;
  meta?: DatabaseFieldMeta;
}

export type DatabaseFilterConjunction = "and" | "or";

export type DatabaseFilterOperator =
  | "is"
  | "isNot"
  | "contains"
  | "doesNotContain"
  | "isGreater"
  | "isGreaterEqual"
  | "isLess"
  | "isLessEqual"
  | "isEmpty"
  | "isNotEmpty"
  | "isAnyOf"
  | "isNoneOf"
  | "hasAnyOf"
  | "hasAllOf"
  | "hasNoneOf"
  | "isExactly"
  | "isNotExactly"
  | "isWithIn"
  | "isBefore"
  | "isAfter"
  | "isOnOrBefore"
  | "isOnOrAfter";

export type DatabaseDateFilterMode =
  | "today"
  | "tomorrow"
  | "yesterday"
  | "currentWeek"
  | "currentMonth"
  | "currentYear"
  | "lastWeek"
  | "lastMonth"
  | "lastYear"
  | "nextWeekPeriod"
  | "nextMonthPeriod"
  | "nextYearPeriod"
  | "oneWeekAgo"
  | "oneWeekFromNow"
  | "oneMonthAgo"
  | "oneMonthFromNow"
  | "daysAgo"
  | "daysFromNow"
  | "exactDate"
  | "exactFormatDate"
  | "dateRange"
  | "pastWeek"
  | "pastMonth"
  | "pastYear"
  | "nextWeek"
  | "nextMonth"
  | "nextYear"
  | "pastNumberOfDays"
  | "nextNumberOfDays";

export interface DatabaseDateFilterValue {
  mode: DatabaseDateFilterMode;
  timeZone: string;
  exactDate?: string;
  exactDateEnd?: string;
  numberOfDays?: number;
}

/** `"Me"` stands for the signed-in person in user filters. */
export type DatabaseFilterValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | DatabaseDateFilterValue;

export interface DatabaseFilterItem {
  fieldId: string;
  operator: DatabaseFilterOperator;
  value: DatabaseFilterValue;
}

export interface DatabaseFilter {
  conjunction: DatabaseFilterConjunction;
  filterSet: (DatabaseFilterItem | DatabaseFilter)[];
}

export type DatabaseSortOrder = "asc" | "desc";

export interface DatabaseSortItem {
  fieldId: string;
  order: DatabaseSortOrder;
}

export interface DatabaseSort {
  sortObjs: DatabaseSortItem[];
  manualSort?: boolean;
}

export type DatabaseGroup = DatabaseSortItem[];

/**
 * The order and the folded groups of the first level of a view's grouping (a board's `stackOrder`
 * and `hiddenStacks`), keyed by the choice name, "true" or "false" for a checkbox, the id of a
 * person or a linked row, "" for the rows without a value.
 */
export interface DatabaseGroupLayout {
  order?: string[];
  hidden?: string[];
}

export type DatabaseStatisticFunc =
  | "count"
  | "empty"
  | "filled"
  | "unique"
  | "max"
  | "min"
  | "sum"
  | "average"
  | "checked"
  | "unChecked"
  | "percentEmpty"
  | "percentFilled"
  | "percentUnique"
  | "percentChecked"
  | "percentUnChecked"
  | "earliestDate"
  | "latestDate"
  | "dateRangeOfDays"
  | "dateRangeOfMonths"
  | "totalAttachmentSize";

/** A calculation of a view (a footer of a table): its value over all the rows, and in each group when asked. */
export interface DatabaseStatisticResult {
  value: number | string | null;
  /** The value in each group of the view, keyed by the ids of the group headers. */
  groups?: Record<string, number | string | null>;
}

export interface DatabaseColumnMeta {
  order: number;
  width?: number;
  /** Grid views hide with `hidden`. */
  hidden?: boolean;
  /** Board, gallery, calendar and form views show with `visible`. */
  visible?: boolean;
  required?: boolean;
  statisticFunc?: DatabaseStatisticFunc | null;
  /** Wraps the column's text on several lines (Notion's « Wrap column »); unset follows the view's row height. */
  wrap?: boolean | null;
}

/** Options stored by the engine, per view type. */
export interface DatabaseViewOptions {
  stackFieldId?: string;
  coverFieldId?: string;
  isCoverFit?: boolean;
  isFieldNameHidden?: boolean;
  isEmptyStackHidden?: boolean;
  startDateFieldId?: string;
  endDateFieldId?: string;
  titleFieldId?: string;
  colorConfig?: { type: "field" | "custom"; fieldId?: string; color?: string };
  rowHeight?: "short" | "medium" | "tall" | "extraTall" | "autoFit";
  frozenFieldId?: string;
  fieldNameDisplayLines?: number;
  coverUrl?: string;
  logoUrl?: string;
  submitLabel?: string;
}

export type DatabaseCardSize = "small" | "medium" | "large";

export type DatabaseOpenPagesIn = "sidePeek" | "centerPeek" | "fullPage";

export type DatabaseTimelineZoom = "week" | "month" | "quarter" | "year";

/** How a table shows the sub-items of its rows: under their parent, folded (Notion's default), as rows of their own, or not at all. */
export type DatabaseSubItemsMode = "nested" | "flattened" | "off";

/** What a board column header shows after the group's name, Notion's calculation of a grouped view. */
export interface DatabaseGroupCalculation {
  /** "count" counts the cards, "none" shows nothing. */
  func: DatabaseStatisticFunc | "none";
  /** The property calculated; not used by "count" and "none". */
  fieldId?: string;
}

/** What Outline adds to a view the engine does not know about. */
export interface DatabaseViewOverrides {
  /** The icon of the view's tab, in place of its layout's: an emoji, an icon name or a custom emoji id, like a document icon. */
  icon?: string;
  /** Draw the engine's grid view as a list or a timeline; null goes back to the table. */
  layout?: DatabaseLayout.List | DatabaseLayout.Timeline | null;
  /** Second level of grouping on a board (swimlanes). */
  subGroupFieldId?: string;
  /** Board column order when it differs from the select's choices (choice names; "" is the empty column). */
  stackOrder?: string[];
  /** Board columns folded away (choice names; "" is the empty column). */
  hiddenStacks?: string[];
  cardSize?: DatabaseCardSize;
  openPagesIn?: DatabaseOpenPagesIn;
  /** Board column headers; the number of cards when absent. */
  groupCalculation?: DatabaseGroupCalculation;
  /** Rows shown before « Load more » when the view is inline in a page, Notion's load limit. */
  loadLimit?: number;
  /** Outline template document used by "New" in this view. */
  defaultTemplateId?: string | null;
  /** How a table shows sub-items when the database has some; nested when unset. */
  subItems?: DatabaseSubItemsMode;
  timeline?: {
    startFieldId?: string;
    endFieldId?: string;
    zoom?: DatabaseTimelineZoom;
    dependencyFieldId?: string;
    showTable?: boolean;
  };
  /** Sharing of a form view: public at `/f/<slug>` once `public` is set. */
  form?: {
    public?: boolean;
    requireLogin?: boolean;
    slug?: string;
    successMessage?: string;
  };
}

export interface DatabaseView {
  id: string;
  name: string;
  type: DatabaseEngineViewType;
  /** `overrides.layout` when set, else the engine type mapped to a layout. */
  layout: DatabaseLayout;
  order: number;
  description?: string | null;
  filter: DatabaseFilter | null;
  sort: DatabaseSort | null;
  group: DatabaseGroup | null;
  columnMeta: Record<string, DatabaseColumnMeta>;
  options: DatabaseViewOptions;
  overrides: DatabaseViewOverrides;
  isLocked: boolean;
}

export interface DatabaseUserValue {
  /** The engine's user id. */
  id: string;
  title: string;
  email?: string;
  avatarUrl?: string | null;
  /** The matching Outline user, resolved by email on the server. */
  outlineUserId?: string | null;
}

export interface DatabaseLinkValue {
  /** The linked record id. */
  id: string;
  title?: string;
  /** The icon of the linked row's page, filled by the server. */
  icon?: string | null;
  /** The colour of that icon. */
  iconColor?: string | null;
}

export interface DatabaseAttachmentValue {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  /** A URL the browser can load. */
  url?: string;
  thumbnailUrl?: string;
  token?: string;
  path?: string;
}

export type DatabaseCellValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | DatabaseUserValue
  | DatabaseUserValue[]
  | DatabaseLinkValue
  | DatabaseLinkValue[]
  | DatabaseAttachmentValue[];

/** What the app sends to write a person field: Outline user ids, resolved to engine users on the server. */
export interface DatabaseUserInput {
  outlineUserId: string;
}

export type DatabaseCellInput =
  | DatabaseCellValue
  | DatabaseUserInput
  | DatabaseUserInput[];

export interface DatabaseRecord {
  id: string;
  fields: Record<string, DatabaseCellValue>;
  createdTime?: string;
  lastModifiedTime?: string;
  createdBy?: string;
  lastModifiedBy?: string;
  /** The Outline document of this row, when it has been opened once. */
  documentId?: string | null;
  /** The icon of that document, filled by the server. */
  icon?: string | null;
  /** The colour of that icon. */
  iconColor?: string | null;
}

export interface DatabaseGroupHeader {
  type: "header";
  id: string;
  depth: number;
  value: DatabaseCellValue;
  isCollapsed: boolean;
}

export interface DatabaseGroupRow {
  type: "row";
  count: number;
}

export type DatabaseGroupPoint = DatabaseGroupHeader | DatabaseGroupRow;

export type DatabaseRecordPosition = "before" | "after";

export interface DatabaseRecordOrder {
  viewId: string;
  anchorId: string;
  position: DatabaseRecordPosition;
}

export interface DatabaseHistoryEntry {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldType: DatabaseFieldType;
  before: DatabaseCellValue;
  after: DatabaseCellValue;
  createdTime: string;
  createdBy: DatabaseUserValue | null;
}

/** A tab of a row page (Notion's page layout). */
export interface DatabasePageTab {
  /** Stable id of the tab (the Notion view id when imported). */
  id: string;
  /** "content": the page's own body. "relation": the rows a relation field of this database links to. */
  kind: "content" | "relation";
  /** Label; the content tab defaults to t("Content"), a relation tab to its field's name. */
  name?: string;
  /** kind "relation": a link (relation) field of THIS database. */
  fieldId?: string;
  /** kind "relation": fields of the LINKED database shown as columns, in order. Absent: its primary field only. */
  visibleFieldIds?: string[];
}

/** Settings Outline keeps on a database (column `databases.settings`). */
export interface DatabaseSettings {
  viewOverrides?: Record<string, DatabaseViewOverrides>;
  fieldMeta?: Record<string, DatabaseFieldMeta>;
  /** Row page customisation (Notion's "Customize page"). */
  pageLayout?: {
    hiddenFieldIds?: string[];
    hideWhenEmptyFieldIds?: string[];
    /** Hide every empty property on row pages. */
    hideEmpty?: boolean;
    /** The tabs under the properties (Notion's page layout); none shows the body alone. */
    tabs?: DatabasePageTab[];
    /**
     * The order of the properties on row pages (Notion's page order); the others follow in the
     * order of the database's first table.
     */
    fieldOrder?: string[];
    /**
     * Notion's page layout with pinned properties: only these show on row pages, in this order,
     * every other one behind « Show details ».
     */
    pinnedFieldIds?: string[];
  };
  /** The field holding a row's emoji (the migration writes one called « Icon »). */
  iconFieldId?: string;
  /**
   * The relation of the table to itself listing a row's sub-items (Notion's « Sub-items »); its
   * symmetric field holds each row's parent.
   */
  subItemFieldId?: string;
  /**
   * The row pages keep their place in the collection's tree, with their sub-pages, like other
   * pages: for a database whose rows are spaces of their own (a project and its pages). Without
   * it, row pages are reached through the database only, as Notion's sidebar never lists rows.
   */
  rowsInSidebar?: boolean;
}

/** Websocket event sent to the readers of a database when its data changes. */
export interface DatabaseChangeEvent {
  databaseId: string;
  kinds: DatabaseChangeKind[];
  recordIds?: string[];
  fieldIds?: string[];
  viewIds?: string[];
  /** The Outline user who made the change, when known. */
  actorId?: string | null;
  /** Echo of the `origin` the change was made with, so a client can ignore its own writes. */
  origin?: string | null;
}

export type DatabaseChangeKind =
  | "record.create"
  | "record.update"
  | "record.delete"
  | "field"
  | "view";

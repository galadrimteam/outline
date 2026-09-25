import type {
  DatabaseCellInput,
  DatabaseDateFilterMode,
  DatabaseDateFilterValue,
  DatabaseField,
  DatabaseFilter,
  DatabaseFilterItem,
  DatabaseFilterOperator,
  DatabaseFilterValue,
  DatabaseSort,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import {
  DATE_WITHIN_FILTER_MODES,
  FILTER_ME,
  dateModeNeedsDate,
  dateModeNeedsDays,
  getDateFilterModes,
  getFilterValueKind,
  getValidFilterOperators,
  isFilterItemComplete,
} from "@shared/databases/filters";
import { ValidationError } from "@server/errors";

/** The filter operators offered to MCP clients, in the order they are documented. */
export const filterOperatorNames = [
  "is",
  "is_not",
  "contains",
  "does_not_contain",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "is_empty",
  "is_not_empty",
  "is_any_of",
  "is_none_of",
  "has_any_of",
  "has_all_of",
  "has_none_of",
  "is_exactly",
  "is_not_exactly",
  "before",
  "after",
  "on_or_before",
  "on_or_after",
  "is_within",
] as const;

export type FilterOperatorName = (typeof filterOperatorNames)[number];

/** A property value as an MCP client writes it. */
export type PropertyInput =
  | string
  | number
  | boolean
  | null
  | (string | number)[];

/** A relative or exact date a date filter compares with. */
export interface DateFilterInput {
  mode: string;
  date?: string;
  days?: number;
}

export type FilterValueInput = PropertyInput | DateFilterInput;

export interface FilterConditionInput {
  property: string;
  operator: FilterOperatorName;
  value?: FilterValueInput;
}

export interface FilterGroupInput {
  conjunction: "and" | "or";
  conditions: FilterConditionInput[];
}

export interface SortInput {
  property: string;
  direction?: "asc" | "desc";
}

/** Finds the workspace members a person cell or filter refers to. */
export interface DatabasePeopleResolver {
  /**
   * Resolves people to Outline users of the team.
   *
   * @param refs e-mails, names, Outline user ids or "me".
   * @returns the Outline user ids, in the same order.
   * @throws ValidationError when a reference matches nobody or several people.
   */
  outlineUserIds(refs: string[]): Promise<string[]>;

  /**
   * Resolves people to the engine's users, as person filters want them.
   *
   * @param refs e-mails, names or Outline user ids.
   * @returns the engine user ids, in the same order.
   * @throws ValidationError when a reference matches nobody or several people.
   */
  engineUserIds(refs: string[]): Promise<string[]>;
}

/** Finds the rows of a linked database a relation cell or filter refers to. */
export interface DatabaseLinkResolver {
  /**
   * Resolves rows of the database linked by a relation property.
   *
   * @param field the relation property.
   * @param refs row ids or row titles.
   * @returns the engine record ids, in the same order.
   * @throws ValidationError when a title matches no row or several rows.
   */
  recordIds(field: DatabaseField, refs: string[]): Promise<string[]>;
}

/**
 * Looks properties, views and select options up by the names people use,
 * forgiving case and accents, and keeps the engine ids out of MCP clients.
 */
export class DatabaseSchemaIndex {
  public readonly fields: DatabaseField[];

  public readonly views: DatabaseView[];

  /**
   * @param schema the database schema, with Outline's settings applied.
   */
  constructor(schema: { fields: DatabaseField[]; views: DatabaseView[] }) {
    this.fields = schema.fields;
    this.views = [...schema.views].sort((a, b) => a.order - b.order);
  }

  /**
   * Finds a property by name or id.
   *
   * @param nameOrId the property name (case and accents ignored) or id.
   * @returns the property.
   * @throws ValidationError when no property or several match.
   */
  public field(nameOrId: string): DatabaseField {
    const field = findByName(this.fields, nameOrId, "property");
    if (!field) {
      throw ValidationError(
        `Unknown property "${nameOrId}". Properties: ${this.fields
          .map((item) => `"${item.name}"`)
          .join(", ")}`
      );
    }
    return field;
  }

  /**
   * Finds a property by id.
   *
   * @param id the property id.
   * @returns the property, or undefined.
   */
  public fieldById(id: string): DatabaseField | undefined {
    return this.fields.find((field) => field.id === id);
  }

  /**
   * Finds a view by name or id.
   *
   * @param nameOrId the view name (case and accents ignored) or id.
   * @returns the view.
   * @throws ValidationError when no view or several match.
   */
  public view(nameOrId: string): DatabaseView {
    const view = findByName(this.views, nameOrId, "view");
    if (!view) {
      throw ValidationError(
        `Unknown view "${nameOrId}". Views: ${this.views
          .map((item) => `"${item.name}"`)
          .join(", ")}`
      );
    }
    return view;
  }

  /**
   * Returns the first view, the one the database opens on.
   *
   * @returns the view, or undefined when the database has none.
   */
  public defaultView(): DatabaseView | undefined {
    return this.views[0];
  }

  /**
   * Returns the first board view.
   *
   * @returns the view, or undefined when the database has no board.
   */
  public boardView(): DatabaseView | undefined {
    return this.views.find((view) => view.layout === DatabaseLayout.Board);
  }

  /**
   * Returns the property a view is split into columns or groups by.
   *
   * @param view the view.
   * @returns the property, or undefined when the view is not grouped.
   */
  public groupingField(view: DatabaseView): DatabaseField | undefined {
    const fieldId = view.options.stackFieldId ?? view.group?.[0]?.fieldId;
    return fieldId ? this.fieldById(fieldId) : undefined;
  }

  /**
   * Returns the exact name of an option of a select property.
   *
   * @param field the select property.
   * @param name the option name (case and accents ignored).
   * @returns the option name as the database spells it.
   * @throws ValidationError when the property has no such option.
   */
  public choice(field: DatabaseField, name: string): string {
    const choices = field.options.choices ?? [];
    const choice = findByName(choices, name, "option");
    if (!choice) {
      throw ValidationError(
        `"${name}" is not an option of "${field.name}". Options: ${choices
          .map((item) => `"${item.name}"`)
          .join(", ")}`
      );
    }
    return choice.name;
  }
}

/**
 * Turns what an MCP client sends, keyed by property names and written the way
 * people write values, into the engine-neutral filters, sorts and cells.
 */
export class DatabaseInputTranslator {
  /**
   * @param index the schema of the database.
   * @param people finds the people named in person cells and filters.
   * @param links finds the rows named in relation cells and filters.
   * @param timeZone the time zone relative dates are read in.
   */
  constructor(
    private readonly index: DatabaseSchemaIndex,
    private readonly people: DatabasePeopleResolver,
    private readonly links: DatabaseLinkResolver,
    private readonly timeZone: string
  ) {}

  /**
   * Builds an engine filter from conditions on property names.
   *
   * @param conditions the conditions, or groups of conditions.
   * @param conjunction how the top-level conditions combine.
   * @returns the filter, or null without conditions.
   * @throws ValidationError when a condition does not fit its property.
   */
  public async filter(
    conditions: (FilterConditionInput | FilterGroupInput)[] | undefined,
    conjunction: "and" | "or" = "and"
  ): Promise<DatabaseFilter | null> {
    if (!conditions?.length) {
      return null;
    }
    const filterSet: (DatabaseFilterItem | DatabaseFilter)[] = [];
    for (const condition of conditions) {
      if ("conditions" in condition) {
        const group = await this.filter(
          condition.conditions,
          condition.conjunction
        );
        if (group) {
          filterSet.push(group);
        }
      } else {
        filterSet.push(await this.filterItem(condition));
      }
    }
    return filterSet.length ? { conjunction, filterSet } : null;
  }

  /**
   * Builds an engine sort from property names.
   *
   * @param items the properties to sort by, most significant first.
   * @returns the sort, or null without items.
   */
  public sort(items: SortInput[] | undefined): DatabaseSort | null {
    if (!items?.length) {
      return null;
    }
    return {
      sortObjs: items.map((item) => ({
        fieldId: this.index.field(item.property).id,
        order: item.direction ?? "asc",
      })),
    };
  }

  /**
   * Builds the cells of a row from values keyed by property names.
   *
   * @param properties the values, keyed by property name or id.
   * @returns the cells, keyed by field id, ready for the user mapper.
   * @throws ValidationError when a property is unknown, read-only, or a value does not fit.
   */
  public async cells(
    properties: Record<string, PropertyInput>
  ): Promise<Record<string, DatabaseCellInput>> {
    const cells: Record<string, DatabaseCellInput> = {};
    for (const [name, value] of Object.entries(properties)) {
      const field = this.index.field(name);
      if (field.id in cells) {
        throw ValidationError(`Property "${field.name}" is given twice`);
      }
      cells[field.id] = await this.cell(field, value);
    }
    return cells;
  }

  /**
   * Converts one value to the cell of a property.
   *
   * @param field the property.
   * @param value the value as people write it.
   * @returns the cell.
   * @throws ValidationError when the property is read-only or the value does not fit.
   */
  public async cell(
    field: DatabaseField,
    value: PropertyInput
  ): Promise<DatabaseCellInput> {
    if (!isWritableField(field)) {
      throw ValidationError(
        `Property "${field.name}" (${field.type}) is computed or holds files and cannot be written here`
      );
    }
    const items = toItems(value);
    if (!items.length) {
      return null;
    }

    switch (field.type) {
      case DatabaseFieldType.Number:
      case DatabaseFieldType.Rating:
        return toNumber(field, single(field, items));
      case DatabaseFieldType.Checkbox:
        return toBoolean(field, single(field, items)) ? true : null;
      case DatabaseFieldType.Date:
        return toIsoDate(field, single(field, items));
      case DatabaseFieldType.SingleSelect:
        return this.index.choice(field, String(single(field, items)));
      case DatabaseFieldType.MultipleSelect:
        return this.choices(field, items);
      case DatabaseFieldType.User: {
        const ids = await this.people.outlineUserIds(items.map(String));
        const users = ids.map((outlineUserId) => ({ outlineUserId }));
        return field.isMultipleCellValue ? users : single(field, users);
      }
      case DatabaseFieldType.Link: {
        const ids = await this.links.recordIds(field, items.map(String));
        const rows = ids.map((id) => ({ id }));
        return field.isMultipleCellValue ? rows : single(field, rows);
      }
      default:
        return items.map(String).join(", ");
    }
  }

  private async filterItem(
    condition: FilterConditionInput
  ): Promise<DatabaseFilterItem> {
    const field = this.index.field(condition.property);
    const value = condition.value ?? null;
    const operator = coerceOperator(
      field,
      engineOperators[condition.operator],
      Array.isArray(value)
    );
    const item: DatabaseFilterItem = {
      fieldId: field.id,
      operator,
      value: await this.filterValue(field, operator, value),
    };
    if (!isFilterItemComplete(item, field)) {
      throw ValidationError(
        `The condition on "${field.name}" needs a value for "${condition.operator}"`
      );
    }
    return item;
  }

  private async filterValue(
    field: DatabaseField,
    operator: DatabaseFilterOperator,
    value: FilterValueInput
  ): Promise<DatabaseFilterValue> {
    const kind = getFilterValueKind(field, operator);
    if (kind === "none") {
      return null;
    }
    if (kind === "date") {
      return this.dateFilterValue(field, operator, value);
    }
    if (isDateInput(value)) {
      throw ValidationError(
        `"${field.name}" is not a date: compare it with a plain value`
      );
    }
    const items = toItems(value);
    const isTextMatch =
      operator === "contains" || operator === "doesNotContain";
    if (kind === "list") {
      return this.filterItems(field, items);
    }
    if (!items.length) {
      return null;
    }
    const item = single(field, items);
    if (field.cellValueType === "boolean") {
      return toBoolean(field, item);
    }
    if (field.cellValueType === "number" && !isTextMatch) {
      return toNumber(field, item);
    }
    if (isTextMatch) {
      return String(item);
    }
    const [resolved] = await this.filterItems(field, [item]);
    return resolved;
  }

  private async filterItems(
    field: DatabaseField,
    items: (string | number)[]
  ): Promise<string[]> {
    const texts = items.map(String);
    switch (field.type) {
      case DatabaseFieldType.SingleSelect:
      case DatabaseFieldType.MultipleSelect:
        return texts.map((text) => this.index.choice(field, text));
      case DatabaseFieldType.User:
      case DatabaseFieldType.CreatedBy:
      case DatabaseFieldType.LastModifiedBy: {
        const others = texts.filter((text) => !isMe(text));
        const ids = await this.people.engineUserIds(others);
        const idByRef = new Map(others.map((text, i) => [text, ids[i]]));
        return texts.map((text) =>
          isMe(text) ? FILTER_ME : (idByRef.get(text) ?? text)
        );
      }
      case DatabaseFieldType.Link:
        return this.links.recordIds(field, texts);
      default:
        return texts;
    }
  }

  private dateFilterValue(
    field: DatabaseField,
    operator: DatabaseFilterOperator,
    value: FilterValueInput
  ): DatabaseDateFilterValue {
    const input: DateFilterInput | undefined = isDateInput(value)
      ? value
      : typeof value === "string"
        ? dateModeFromName(value)
          ? { mode: value }
          : { mode: "exactDate", date: value }
        : undefined;
    const mode = input ? dateModeFromName(input.mode) : undefined;
    const modes = getDateFilterModes(operator);
    if (!input || !mode || !modes.includes(mode)) {
      throw ValidationError(
        `The condition on "${field.name}" needs a date (YYYY-MM-DD) or one of: ${modes
          .map(snakeCase)
          .join(", ")}`
      );
    }

    const result: DatabaseDateFilterValue = { mode, timeZone: this.timeZone };
    if (dateModeNeedsDays(mode)) {
      if (typeof input.days !== "number") {
        throw ValidationError(
          `The date mode "${snakeCase(mode)}" on "${field.name}" needs a number of days`
        );
      }
      result.numberOfDays = input.days;
    }
    if (dateModeNeedsDate(mode)) {
      if (!input.date) {
        throw ValidationError(
          `The date mode "${snakeCase(mode)}" on "${field.name}" needs a date`
        );
      }
      result.exactDate = dayInstant(field, input.date);
    }
    return result;
  }

  private choices(field: DatabaseField, items: (string | number)[]): string[] {
    const texts = items.map(String);
    // One string may list several options, unless it is itself an option name
    // with a comma in it.
    if (
      texts.length === 1 &&
      !findByName(field.options.choices ?? [], texts[0], "option")
    ) {
      return texts[0]
        .split(",")
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => this.index.choice(field, text));
    }
    return texts.map((text) => this.index.choice(field, text));
  }
}

/**
 * Returns the name an MCP client uses for an engine filter operator.
 *
 * @param operator the engine operator.
 * @returns the operator name, words separated by spaces.
 */
export function describeOperator(operator: DatabaseFilterOperator): string {
  const name = filterOperatorNames.find(
    (item) => engineOperators[item] === operator
  );
  return (name ?? operator).replace(/_/g, " ");
}

/**
 * Returns a date mode as MCP clients write it.
 *
 * @param mode the engine date mode.
 * @returns the mode in snake case.
 */
export function snakeCase(mode: string): string {
  return mode.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Compares two names the way people expect: case, accents and repeated
 * spaces do not matter.
 *
 * @param a a name.
 * @param b another name.
 * @returns true when the names are the same.
 */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/**
 * Whether a reference to a person means the acting user.
 *
 * @param text the reference.
 * @returns true for "me".
 */
export function isMe(text: string): boolean {
  return ["me", "moi", "myself"].includes(text.trim().toLowerCase());
}

/**
 * Whether a property can be written by MCP clients: not computed, not a
 * lookup, and not a file property (uploads have their own route).
 *
 * @param field the property.
 * @returns true when its cells can be written.
 */
export function isWritableField(field: DatabaseField): boolean {
  return (
    !field.isComputed && !field.isLookup && !readOnlyTypes.includes(field.type)
  );
}

const engineOperators: Record<FilterOperatorName, DatabaseFilterOperator> = {
  is: "is",
  is_not: "isNot",
  contains: "contains",
  does_not_contain: "doesNotContain",
  greater_than: "isGreater",
  greater_than_or_equal: "isGreaterEqual",
  less_than: "isLess",
  less_than_or_equal: "isLessEqual",
  is_empty: "isEmpty",
  is_not_empty: "isNotEmpty",
  is_any_of: "isAnyOf",
  is_none_of: "isNoneOf",
  has_any_of: "hasAnyOf",
  has_all_of: "hasAllOf",
  has_none_of: "hasNoneOf",
  is_exactly: "isExactly",
  is_not_exactly: "isNotExactly",
  before: "isBefore",
  after: "isAfter",
  on_or_before: "isOnOrBefore",
  on_or_after: "isOnOrAfter",
  is_within: "isWithIn",
};

/**
 * What an operator that does not apply to a property most likely meant, e.g.
 * "is" on a multi-select means "has any of", "greater than" on a date "after".
 */
const operatorFallbacks: Partial<
  Record<DatabaseFilterOperator, DatabaseFilterOperator[]>
> = {
  is: ["hasAnyOf"],
  isNot: ["hasNoneOf"],
  contains: ["hasAnyOf", "is"],
  doesNotContain: ["hasNoneOf", "isNot"],
  isAnyOf: ["hasAnyOf"],
  isNoneOf: ["hasNoneOf"],
  hasAnyOf: ["isAnyOf"],
  hasNoneOf: ["isNoneOf"],
  isGreater: ["isAfter"],
  isGreaterEqual: ["isOnOrAfter"],
  isLess: ["isBefore"],
  isLessEqual: ["isOnOrBefore"],
  isAfter: ["isGreater"],
  isOnOrAfter: ["isGreaterEqual"],
  isBefore: ["isLess"],
  isOnOrBefore: ["isLessEqual"],
};

const readOnlyTypes: DatabaseFieldType[] = [
  DatabaseFieldType.Formula,
  DatabaseFieldType.Rollup,
  DatabaseFieldType.ConditionalRollup,
  DatabaseFieldType.AutoNumber,
  DatabaseFieldType.CreatedTime,
  DatabaseFieldType.LastModifiedTime,
  DatabaseFieldType.CreatedBy,
  DatabaseFieldType.LastModifiedBy,
  DatabaseFieldType.Button,
  DatabaseFieldType.Attachment,
];

const dateModeAliases: Record<string, DatabaseDateFilterMode> = {
  thisweek: "currentWeek",
  thismonth: "currentMonth",
  thisyear: "currentYear",
  date: "exactDate",
};

const isoDate =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const dayOnly = /^\d{4}-\d{2}-\d{2}$/;

function coerceOperator(
  field: DatabaseField,
  operator: DatabaseFilterOperator,
  isList: boolean
): DatabaseFilterOperator {
  const valid = getValidFilterOperators(field);
  if (isList && operator === "is" && valid.includes("isAnyOf")) {
    return "isAnyOf";
  }
  if (isList && operator === "isNot" && valid.includes("isNoneOf")) {
    return "isNoneOf";
  }
  if (valid.includes(operator)) {
    return operator;
  }
  const fallback = operatorFallbacks[operator]?.find((item) =>
    valid.includes(item)
  );
  if (fallback) {
    return fallback;
  }
  throw ValidationError(
    `Operator "${describeOperator(operator)}" does not apply to "${field.name}" (${field.type}). Use one of: ${valid
      .map((item) => describeOperator(item).replace(/ /g, "_"))
      .join(", ")}`
  );
}

function dateModeFromName(name: string): DatabaseDateFilterMode | undefined {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  return (
    dateModeAliases[key] ??
    DATE_WITHIN_FILTER_MODES.find((mode) => mode.toLowerCase() === key)
  );
}

/**
 * A calendar day given without a time is sent as noon UTC, which falls on
 * that day in every time zone from UTC-11 to UTC+11, since the engine reads
 * an exact date in the reader's time zone.
 */
function dayInstant(field: DatabaseField, value: string): string {
  if (dayOnly.test(value)) {
    return `${value}T12:00:00.000Z`;
  }
  return toIsoDate(field, value);
}

/** Dates are passed on as written: the engine reads them in the field's time zone. */
function toIsoDate(field: DatabaseField, value: string | number): string {
  const text = String(value).trim();
  if (text === "now") {
    return new Date().toISOString();
  }
  if (!isoDate.test(text) || Number.isNaN(Date.parse(text))) {
    throw ValidationError(
      `"${text}" is not a date for "${field.name}": use ISO 8601, e.g. 2026-10-01 or 2026-10-01T14:30:00+02:00`
    );
  }
  return text;
}

function toNumber(field: DatabaseField, value: string | number): number {
  const number =
    typeof value === "number"
      ? value
      : Number(value.trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(number)) {
    throw ValidationError(`"${value}" is not a number for "${field.name}"`);
  }
  return number;
}

function toBoolean(field: DatabaseField, value: string | number): boolean {
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "oui", "1", "checked", "x"].includes(text)) {
    return true;
  }
  if (["false", "no", "non", "0", "unchecked", ""].includes(text)) {
    return false;
  }
  throw ValidationError(`"${value}" is not true or false for "${field.name}"`);
}

function toItems(value: FilterValueInput | undefined): (string | number)[] {
  if (value === null || value === undefined || isDateInput(value)) {
    return [];
  }
  if (typeof value === "boolean") {
    return [String(value)];
  }
  const items = Array.isArray(value) ? value : [value];
  return items.filter((item) => !(typeof item === "string" && !item.trim()));
}

function single<T>(field: DatabaseField, items: T[]): T {
  if (items.length > 1) {
    throw ValidationError(`"${field.name}" takes a single value`);
  }
  return items[0];
}

function isDateInput(
  value: FilterValueInput | undefined
): value is DateFilterInput {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findByName<T extends { name: string; id?: string }>(
  items: T[],
  name: string,
  what: string
): T | undefined {
  const exact = items.find((item) => item.name === name || item.id === name);
  if (exact) {
    return exact;
  }
  const matches = items.filter((item) => sameName(item.name, name));
  if (matches.length > 1) {
    throw ValidationError(
      `Several ${what}s are named "${name}": give the exact name or the id`
    );
  }
  return matches[0];
}

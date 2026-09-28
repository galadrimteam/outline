import type { TFunction } from "i18next";
import {
  appendFilterNode,
  canNestFilterGroup,
  changeFilterItemField,
  changeFilterItemOperator,
  countFilterRules,
  createFilterItem,
  dateFilterModeLabel,
  DATE_FILTER_MODES,
  DATE_WITHIN_FILTER_MODES,
  emptyFilter,
  filterDepth,
  filterOperatorLabel,
  filtersEqual,
  getDateFilterModes,
  getDefaultFilterOperator,
  getDefaultFilterValue,
  getFilterNode,
  getFilterValueKind,
  getValidFilterOperators,
  isFilterItemComplete,
  isSimpleFilter,
  MAX_FILTER_DEPTH,
  operatorHidesValue,
  removeFilterNode,
  sanitizeFilter,
  setFilterConjunction,
  updateFilterNode,
} from "./filters";
import type { DatabaseField, DatabaseFilter } from "./types";
import { DatabaseFieldType } from "./types";

const t = ((key: string) => key) as unknown as TFunction;

function field(
  id: string,
  type: DatabaseFieldType,
  cellValueType: DatabaseField["cellValueType"],
  isMultipleCellValue = false
): DatabaseField {
  return {
    id,
    name: id,
    type,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType,
    isMultipleCellValue,
  };
}

const text = field("text", DatabaseFieldType.SingleLineText, "string");
const num = field("num", DatabaseFieldType.Number, "number");
const check = field("check", DatabaseFieldType.Checkbox, "boolean");
const date = field("date", DatabaseFieldType.Date, "dateTime");
const status = field("status", DatabaseFieldType.SingleSelect, "string");
const tags = field("tags", DatabaseFieldType.MultipleSelect, "string", true);
const owner = field("owner", DatabaseFieldType.User, "string");
const owners = field("owners", DatabaseFieldType.User, "string", true);
const link = field("link", DatabaseFieldType.Link, "string", true);
const files = field("files", DatabaseFieldType.Attachment, "string", true);
const button = field("button", DatabaseFieldType.Button, "string");
const formulaDate = field("fdate", DatabaseFieldType.Formula, "dateTime");

const fields = [text, num, check, date, status, tags, owner, link];
const byId = (id: string) => fields.find((f) => f.id === id);

describe("getValidFilterOperators", () => {
  it("follows the value type for plain fields", () => {
    expect(getValidFilterOperators(text)).toEqual([
      "is",
      "isNot",
      "contains",
      "doesNotContain",
      "isEmpty",
      "isNotEmpty",
    ]);
    expect(getValidFilterOperators(num)).toContain("isGreaterEqual");
    expect(getValidFilterOperators(check)).toEqual(["is"]);
    expect(getValidFilterOperators(date)).toContain("isWithIn");
    expect(getValidFilterOperators(formulaDate)).toContain("isOnOrAfter");
  });

  it("offers any/none of for a single select, without contains", () => {
    expect(getValidFilterOperators(status)).toEqual([
      "is",
      "isNot",
      "isAnyOf",
      "isNoneOf",
      "isEmpty",
      "isNotEmpty",
    ]);
  });

  it("offers list operators for multiple values", () => {
    expect(getValidFilterOperators(tags)).toEqual([
      "hasAnyOf",
      "hasAllOf",
      "isExactly",
      "isNotExactly",
      "hasNoneOf",
      "isEmpty",
      "isNotEmpty",
    ]);
    expect(getValidFilterOperators(owners)).toEqual([
      "hasAnyOf",
      "hasAllOf",
      "isExactly",
      "hasNoneOf",
      "isNotExactly",
      "isEmpty",
      "isNotEmpty",
    ]);
  });

  it("adds contains to links and only emptiness to attachments", () => {
    expect(getValidFilterOperators(link)).toContain("contains");
    expect(getValidFilterOperators(owner)).not.toContain("contains");
    expect(getValidFilterOperators(files)).toEqual(["isEmpty", "isNotEmpty"]);
    expect(getValidFilterOperators(button)).toEqual([]);
  });
});

describe("defaults", () => {
  it("starts text with contains and others with their first operator", () => {
    expect(getDefaultFilterOperator(text)).toBe("contains");
    expect(getDefaultFilterOperator(status)).toBe("is");
    expect(getDefaultFilterOperator(tags)).toBe("hasAnyOf");
    expect(getDefaultFilterOperator(button)).toBeUndefined();
  });

  it("gives each operator kind its starting value", () => {
    expect(getDefaultFilterValue(text, "isEmpty", "UTC")).toBeNull();
    expect(getDefaultFilterValue(status, "isAnyOf", "UTC")).toEqual([]);
    expect(getDefaultFilterValue(check, "is", "UTC")).toBe(true);
    expect(getDefaultFilterValue(date, "is", "Europe/Paris")).toEqual({
      mode: "today",
      timeZone: "Europe/Paris",
    });
    expect(getDefaultFilterValue(date, "isWithIn", "UTC")).toEqual({
      mode: "pastWeek",
      timeZone: "UTC",
    });
  });

  it("hides the value editor of emptiness operators", () => {
    expect(operatorHidesValue("isEmpty")).toBe(true);
    expect(operatorHidesValue("isNotEmpty")).toBe(true);
    expect(operatorHidesValue("is")).toBe(false);
    expect(getFilterValueKind(date, "isEmpty")).toBe("none");
    expect(getFilterValueKind(date, "isBefore")).toBe("date");
    expect(getFilterValueKind(tags, "hasAllOf")).toBe("list");
  });

  it("offers the within windows only with is within", () => {
    expect(getDateFilterModes("isWithIn")).toBe(DATE_WITHIN_FILTER_MODES);
    expect(getDateFilterModes("isBefore")).toBe(DATE_FILTER_MODES);
    expect(DATE_FILTER_MODES).not.toContain("pastWeek");
  });
});

describe("rule edits", () => {
  it("creates a rule with the default operator and value", () => {
    expect(createFilterItem(status, "UTC")).toEqual({
      fieldId: "status",
      operator: "is",
      value: null,
    });
    expect(createFilterItem(button, "UTC")).toBeUndefined();
  });

  it("keeps the operator when the new field allows it", () => {
    const item = { fieldId: "text", operator: "isNot" as const, value: "a" };
    expect(changeFilterItemField(item, status, "UTC")).toEqual({
      fieldId: "status",
      operator: "isNot",
      value: null,
    });
    expect(changeFilterItemField(item, tags, "UTC").operator).toBe("hasAnyOf");
  });

  it("keeps the value while the operator kind stays the same", () => {
    const item = { fieldId: "text", operator: "is" as const, value: "a" };
    expect(changeFilterItemOperator(item, text, "contains", "UTC").value).toBe(
      "a"
    );
    expect(
      changeFilterItemOperator(item, text, "isEmpty", "UTC").value
    ).toBeNull();
    const list = { fieldId: "status", operator: "isAnyOf" as const, value: [] };
    expect(
      changeFilterItemOperator(list, status, "is", "UTC").value
    ).toBeNull();
  });

  it("resets a within window when the operator no longer offers it", () => {
    const item = {
      fieldId: "date",
      operator: "isWithIn" as const,
      value: { mode: "pastMonth" as const, timeZone: "UTC" },
    };
    expect(
      changeFilterItemOperator(item, date, "isBefore", "UTC").value
    ).toEqual({ mode: "today", timeZone: "UTC" });
    const today = {
      ...item,
      value: { mode: "today" as const, timeZone: "UTC" },
    };
    expect(
      changeFilterItemOperator(today, date, "isBefore", "UTC").value
    ).toEqual({ mode: "today", timeZone: "UTC" });
  });
});

describe("isFilterItemComplete", () => {
  it("requires a value unless the operator takes none", () => {
    expect(
      isFilterItemComplete({ fieldId: "text", operator: "is", value: "" }, text)
    ).toBe(false);
    expect(
      isFilterItemComplete(
        { fieldId: "text", operator: "is", value: "a" },
        text
      )
    ).toBe(true);
    expect(
      isFilterItemComplete(
        { fieldId: "text", operator: "isEmpty", value: null },
        text
      )
    ).toBe(true);
    expect(
      isFilterItemComplete(
        { fieldId: "status", operator: "isAnyOf", value: [] },
        status
      )
    ).toBe(false);
    expect(
      isFilterItemComplete({ fieldId: "num", operator: "is", value: 0 }, num)
    ).toBe(true);
    expect(
      isFilterItemComplete(
        { fieldId: "check", operator: "is", value: false },
        check
      )
    ).toBe(true);
    expect(
      isFilterItemComplete(
        { fieldId: "owner", operator: "is", value: "Me" },
        owner
      )
    ).toBe(true);
  });

  it("checks the extras of date modes", () => {
    expect(
      isFilterItemComplete(
        {
          fieldId: "date",
          operator: "isWithIn",
          value: { mode: "pastNumberOfDays", timeZone: "UTC" },
        },
        date
      )
    ).toBe(false);
    expect(
      isFilterItemComplete(
        {
          fieldId: "date",
          operator: "isWithIn",
          value: {
            mode: "pastNumberOfDays",
            timeZone: "UTC",
            numberOfDays: 14,
          },
        },
        date
      )
    ).toBe(true);
    expect(
      isFilterItemComplete(
        {
          fieldId: "date",
          operator: "is",
          value: { mode: "pastWeek", timeZone: "UTC" },
        },
        date
      )
    ).toBe(false);
  });

  it("rejects unknown fields and operators", () => {
    expect(
      isFilterItemComplete(
        { fieldId: "gone", operator: "isEmpty", value: null },
        undefined
      )
    ).toBe(false);
    expect(
      isFilterItemComplete(
        { fieldId: "check", operator: "isEmpty", value: null },
        check
      )
    ).toBe(false);
  });
});

describe("filter trees", () => {
  const nested: DatabaseFilter = {
    conjunction: "or",
    filterSet: [
      { fieldId: "status", operator: "isNot", value: "Done" },
      {
        conjunction: "and",
        filterSet: [
          { fieldId: "status", operator: "is", value: "Done" },
          {
            fieldId: "date",
            operator: "isWithIn",
            value: {
              mode: "pastNumberOfDays",
              timeZone: "UTC",
              numberOfDays: 14,
            },
          },
        ],
      },
    ],
  };

  it("counts rules and depth", () => {
    expect(countFilterRules(nested)).toBe(3);
    expect(countFilterRules(null)).toBe(0);
    expect(filterDepth(nested)).toBe(2);
    expect(isSimpleFilter(nested)).toBe(false);
    expect(isSimpleFilter(emptyFilter())).toBe(true);
  });

  it("reads, updates and removes by path", () => {
    expect(getFilterNode(nested, [1, 0])).toEqual({
      fieldId: "status",
      operator: "is",
      value: "Done",
    });
    expect(getFilterNode(nested, [0, 0])).toBeUndefined();

    const updated = updateFilterNode(nested, [1, 0], {
      fieldId: "status",
      operator: "is",
      value: "Doing",
    });
    expect(getFilterNode(updated, [1, 0])).toMatchObject({ value: "Doing" });
    expect(getFilterNode(nested, [1, 0])).toMatchObject({ value: "Done" });

    const removed = removeFilterNode(removeFilterNode(nested, [1, 0]), [1, 0]);
    expect(removed.filterSet).toHaveLength(1);
  });

  it("appends within the depth limit only", () => {
    const group: DatabaseFilter = { conjunction: "and", filterSet: [] };
    const one = appendFilterNode(emptyFilter(), [], group);
    expect(one.filterSet).toHaveLength(1);
    const two = appendFilterNode(one, [0], group);
    expect(filterDepth(two)).toBe(MAX_FILTER_DEPTH);
    expect(appendFilterNode(two, [0, 0], group)).toBe(two);
    expect(canNestFilterGroup([])).toBe(true);
    expect(canNestFilterGroup([0])).toBe(true);
    expect(canNestFilterGroup([0, 0])).toBe(false);
  });

  it("sets the conjunction of a nested group", () => {
    const next = setFilterConjunction(nested, [1], "or");
    expect(getFilterNode(next, [1])).toMatchObject({ conjunction: "or" });
  });

  it("drops incomplete rules and empty groups before sending", () => {
    const draft: DatabaseFilter = {
      conjunction: "and",
      filterSet: [
        { fieldId: "text", operator: "contains", value: "" },
        { conjunction: "or", filterSet: [] },
        {
          conjunction: "or",
          filterSet: [{ fieldId: "gone", operator: "isEmpty", value: null }],
        },
        { fieldId: "owner", operator: "is", value: "Me" },
      ],
    };
    expect(sanitizeFilter(draft, byId)).toEqual({
      conjunction: "and",
      filterSet: [{ fieldId: "owner", operator: "is", value: "Me" }],
    });
    expect(sanitizeFilter(emptyFilter(), byId)).toBeNull();
    expect(sanitizeFilter(nested, byId)).toEqual(nested);
  });

  it("compares filters once normalized", () => {
    expect(filtersEqual(null, emptyFilter())).toBe(true);
    expect(
      filtersEqual(nested, {
        ...nested,
        filterSet: [...nested.filterSet, { conjunction: "and", filterSet: [] }],
      })
    ).toBe(true);
    expect(filtersEqual(nested, null)).toBe(false);
  });
});

describe("labels", () => {
  it("uses symbols for number comparisons", () => {
    expect(filterOperatorLabel("isGreater", t, "number")).toBe(">");
    expect(filterOperatorLabel("isGreater", t, "string")).toBe(
      "Is greater than"
    );
    expect(filterOperatorLabel("isEmpty", t, "number")).toBe("Is empty");
  });

  it("names every date mode", () => {
    for (const mode of DATE_WITHIN_FILTER_MODES) {
      expect(dateFilterModeLabel(mode, t)).toBeTruthy();
    }
  });
});

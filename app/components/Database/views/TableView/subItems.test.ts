import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import {
  childrenFilter,
  hasSubItems,
  parentTitles,
  subItemsOf,
  topLevelFilter,
} from "./subItems";
import { makeField, makeView } from "./testFixtures";

const children = makeField({
  id: "children",
  type: DatabaseFieldType.Link,
  isMultipleCellValue: true,
  options: { symmetricFieldId: "parent" },
});
const parent = makeField({
  id: "parent",
  type: DatabaseFieldType.Link,
  isMultipleCellValue: true,
  options: { symmetricFieldId: "children" },
});
const fields = [makeField({ id: "name", isPrimary: true }), children, parent];
const database = {
  settings: { subItemFieldId: "children" },
  fieldById: (id: string) => fields.find((field) => field.id === id),
};

describe("subItemsOf", () => {
  it("nests the sub-items of a table unless the view says otherwise", () => {
    expect(subItemsOf(database, makeView())).toEqual({
      mode: "nested",
      childrenField: children,
      parentField: parent,
    });
    expect(
      subItemsOf(database, makeView({ overrides: { subItems: "flattened" } }))
        ?.mode
    ).toBe("flattened");
    expect(
      subItemsOf(database, makeView({ overrides: { subItems: "off" } }))
    ).toBeUndefined();
  });

  it("needs a table and a relation with its symmetric field", () => {
    expect(
      subItemsOf(database, makeView({ layout: DatabaseLayout.Board }))
    ).toBeUndefined();
    expect(subItemsOf({ ...database, settings: {} }, makeView())).toBe(
      undefined
    );
    expect(
      subItemsOf(
        { ...database, settings: { subItemFieldId: "name" } },
        makeView()
      )
    ).toBeUndefined();
  });
});

describe("sub-item filters", () => {
  const subItems = subItemsOf(database, makeView());

  it("lists the rows without a parent at the top", () => {
    expect(subItems && topLevelFilter(subItems)).toEqual({
      conjunction: "and",
      filterSet: [{ fieldId: "parent", operator: "isEmpty", value: null }],
    });
  });

  it("lists the sub-items of a row", () => {
    expect(subItems && childrenFilter(subItems, "rec1")).toEqual({
      conjunction: "and",
      filterSet: [{ fieldId: "parent", operator: "hasAnyOf", value: ["rec1"] }],
    });
    const single = subItemsOf(
      {
        ...database,
        fieldById: (id: string) =>
          id === "parent"
            ? { ...parent, isMultipleCellValue: false }
            : database.fieldById(id),
      },
      makeView()
    );
    expect(single && childrenFilter(single, "rec1").filterSet).toEqual([
      { fieldId: "parent", operator: "is", value: "rec1" },
    ]);
  });

  it("reads a row's sub-items and parents", () => {
    const record = {
      id: "rec2",
      fields: {
        children: [{ id: "rec3", title: "Child" }],
        parent: [{ id: "rec1", title: "Visio" }],
      },
    };
    expect(subItems && hasSubItems(record, subItems)).toBe(true);
    expect(subItems && parentTitles(record, subItems)).toEqual(["Visio"]);
    expect(subItems && hasSubItems({ id: "rec4", fields: {} }, subItems)).toBe(
      false
    );
  });
});

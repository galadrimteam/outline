import { DatabaseFieldType } from "@shared/databases/types";
import { makeField } from "./TableView/testFixtures";
import { subItemCount } from "./SubItemCount";

const children = makeField({
  id: "children",
  type: DatabaseFieldType.Link,
  isMultipleCellValue: true,
});
const database = {
  settings: { subItemFieldId: "children" },
  fieldById: (id: string) => (id === "children" ? children : undefined),
};

describe("subItemCount", () => {
  it("counts the sub-items of a row", () => {
    expect(
      subItemCount(database, {
        id: "rec1",
        fields: { children: [{ id: "a" }, { id: "b" }] },
      })
    ).toBe(2);
    expect(subItemCount(database, { id: "rec2", fields: {} })).toBe(0);
  });

  it("counts nothing when the database has no sub-items", () => {
    expect(
      subItemCount(
        { settings: {}, fieldById: database.fieldById },
        { id: "rec1", fields: { children: [{ id: "a" }] } }
      )
    ).toBe(0);
  });
});

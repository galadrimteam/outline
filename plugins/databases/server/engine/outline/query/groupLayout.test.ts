import { DatabaseFieldType } from "@shared/databases/types";
import { groupKey, groupRank } from "./groupLayout";
import { makeField } from "./testFixtures";

describe("groupKey", () => {
  it("keys groups as the app and the migration name them", () => {
    const select = makeField({ id: "s", type: DatabaseFieldType.SingleSelect });
    const box = makeField({ id: "b", type: DatabaseFieldType.Checkbox });
    const link = makeField({
      id: "l",
      type: DatabaseFieldType.Link,
      isMultipleCellValue: true,
    });
    const person = makeField({ id: "u", type: DatabaseFieldType.User });
    expect(groupKey(select, "S1")).toBe("S1");
    expect(groupKey(select, null)).toBe("");
    expect(groupKey(box, true)).toBe("true");
    expect(groupKey(box, null)).toBe("false");
    expect(groupKey(link, [{ id: "rec9", title: "V3" }])).toBe("rec9");
    expect(groupKey(link, [])).toBe("");
    expect(groupKey(person, { id: "usr1", title: "Ada" })).toBe("usr1");
  });
});

describe("groupRank", () => {
  it("ranks the listed groups first, in their order", () => {
    const select = makeField({ id: "s", type: DatabaseFieldType.SingleSelect });
    const rank = groupRank(select, { order: ["S2", "", "S1"] });
    expect(rank?.("S1")).toBe(2);
    expect(rank?.(null)).toBe(1);
    expect(rank?.("S9")).toBe(Number.POSITIVE_INFINITY);
    expect(groupRank(select, { hidden: ["S1"] })).toBeUndefined();
  });
});

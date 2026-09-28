import type { DatabaseField } from "@shared/databases/types";
import { linkedRecordPath } from "./LinkCell";

const relation = (options: DatabaseField["options"]) =>
  ({ id: "fldEpic", name: "Epic", type: "link", options }) as DatabaseField;

describe("linkedRecordPath", () => {
  it("opens a linked row in the database of its own table", () => {
    expect(
      linkedRecordPath(relation({ foreignDatabaseId: "db-gantt" }), "rec1")
    ).toBe("/db/db-gantt/row/rec1");
  });

  it("has no page to open when the linked table has no Outline database", () => {
    expect(linkedRecordPath(relation({}), "rec1")).toBeNull();
  });
});

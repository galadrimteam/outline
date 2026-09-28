import { DatabaseFieldType } from "@shared/databases/types";
import {
  contextAt,
  formulaField,
  makeField,
  makeRecord,
  makeTable,
} from "../testFixtures";
import { computeBase } from "./computeBase";

const context = contextAt("2025-06-15T10:00:00.000Z");

describe("computeBase", () => {
  it("fills system fields, people by id only", () => {
    const table = makeTable(
      "tblSys",
      [
        makeField({ id: "name", type: DatabaseFieldType.SingleLineText }),
        makeField({ id: "number", type: DatabaseFieldType.AutoNumber }),
        makeField({ id: "created", type: DatabaseFieldType.CreatedTime }),
        makeField({ id: "modified", type: DatabaseFieldType.LastModifiedTime }),
        makeField({ id: "creator", type: DatabaseFieldType.CreatedBy }),
        makeField({ id: "modifier", type: DatabaseFieldType.LastModifiedBy }),
      ],
      [
        makeRecord("rec1", { name: "a", number: 99 }, { autoNumber: 4 }),
        makeRecord(
          "rec2",
          { name: "b" },
          { autoNumber: 2, lastModifiedBy: null }
        ),
      ]
    );
    const base = computeBase([table], context);
    expect(base.records("tblSys").map((record) => record.row.id)).toEqual([
      "rec2",
      "rec1",
    ]);
    expect(base.record("tblSys", "rec1")?.cells).toEqual({
      name: "a",
      number: 4,
      created: "2025-01-01T09:00:00.000Z",
      modified: "2025-01-02T09:00:00.000Z",
      creator: { id: "user-1", title: "" },
      modifier: { id: "user-2", title: "" },
    });
    expect(base.record("tblSys", "rec2")?.cells.modifier).toBeNull();
    expect(base.records("tblUnknown")).toEqual([]);
    expect(base.record("tblSys", "recUnknown")).toBeUndefined();
  });

  it("does not change the stored cells", () => {
    const cells = { name: "a" };
    const table = makeTable(
      "tblPure",
      [
        makeField({ id: "name", type: DatabaseFieldType.SingleLineText }),
        formulaField("upper", "UPPER({name})", "string"),
      ],
      [makeRecord("rec1", cells)]
    );
    const base = computeBase([table], context);
    expect(base.record("tblPure", "rec1")?.cells.upper).toBe("A");
    expect(cells).toEqual({ name: "a" });
  });

  it("gives no value to the fields of a cycle, and to what reads them", () => {
    const table = makeTable(
      "tblCycle",
      [
        makeField({ id: "name", type: DatabaseFieldType.SingleLineText }),
        formulaField("a", "{b} + 1", "number"),
        formulaField("b", "{a} + 1", "number"),
        formulaField("self", "{self} + 1", "number"),
        formulaField("after", "{a} + 10", "number"),
        formulaField("fine", "LEN({name})", "number"),
      ],
      [makeRecord("rec1", { name: "abc" })]
    );
    const cells = computeBase([table], context).record(
      "tblCycle",
      "rec1"
    )?.cells;
    expect(cells?.a).toBeNull();
    expect(cells?.b).toBeNull();
    expect(cells?.self).toBeNull();
    expect(cells?.after).toBe(10);
    expect(cells?.fine).toBe(3);
  });

  it("leaves broken formulas and failing records empty", () => {
    const table = makeTable(
      "tblBroken",
      [
        makeField({ id: "name", type: DatabaseFieldType.SingleLineText }),
        formulaField("syntax", "1 +", "number"),
        formulaField("unknown", "{nope}", "string"),
        formulaField("fails", 'IF({name} = "b", ERROR("x"), 1)', "number"),
      ],
      [makeRecord("rec1", { name: "a" }), makeRecord("rec2", { name: "b" })]
    );
    const base = computeBase([table], context);
    expect(base.record("tblBroken", "rec1")?.cells).toMatchObject({
      syntax: null,
      unknown: null,
      fails: 1,
    });
    expect(base.record("tblBroken", "rec2")?.cells.fails).toBeNull();
  });

  it("converts a result to the type the field declares", () => {
    const table = makeTable(
      "tblTypes",
      [
        makeField({ id: "name", type: DatabaseFieldType.SingleLineText }),
        formulaField("asText", "1 + 1", "string"),
        formulaField("asNumber", '"12 €"', "number"),
        formulaField("list", "{name}", "string", { isMultipleCellValue: true }),
      ],
      [makeRecord("rec1", { name: "a" })]
    );
    expect(
      computeBase([table], context).record("tblTypes", "rec1")?.cells
    ).toMatchObject({
      asText: "2",
      asNumber: 12,
      list: ["a"],
    });
  });

  it("titles links with a computed primary field, of another table", () => {
    const people = makeTable(
      "tblPeople",
      [
        formulaField("full", '{first} & " " & {last}', "string", {
          isPrimary: true,
        }),
        makeField({ id: "first", type: DatabaseFieldType.SingleLineText }),
        makeField({ id: "last", type: DatabaseFieldType.SingleLineText }),
      ],
      [makeRecord("recP1", { first: "Ada", last: "Lovelace" })]
    );
    const tasks = makeTable(
      "tblTasks",
      [
        makeField({ id: "task", type: DatabaseFieldType.SingleLineText }),
        makeField({
          id: "owner",
          type: DatabaseFieldType.Link,
          options: { foreignTableId: "tblPeople", relationship: "manyOne" },
        }),
        makeField({
          id: "outside",
          type: DatabaseFieldType.Link,
          options: { foreignTableId: "tblElsewhere" },
        }),
        formulaField("label", '{task} & " (" & {owner} & ")"', "string"),
      ],
      [
        makeRecord("recT1", {
          task: "Write",
          owner: [{ id: "recP1" }],
          outside: [{ id: "recX" }],
        }),
      ]
    );
    const cells = computeBase([tasks, people], context).record(
      "tblTasks",
      "recT1"
    )?.cells;
    expect(cells?.owner).toEqual({ id: "recP1", title: "Ada Lovelace" });
    expect(cells?.outside).toEqual([{ id: "recX" }]);
    expect(cells?.label).toBe("Write (Ada Lovelace)");
  });

  it("looks up values through a link, blanks dropped, one when the lookup is single", () => {
    const projects = makeTable(
      "tblProjects",
      [
        makeField({ id: "project", type: DatabaseFieldType.SingleLineText }),
        makeField({ id: "budget", type: DatabaseFieldType.Number }),
      ],
      [
        makeRecord("recA", { project: "A", budget: 10 }),
        makeRecord("recB", { project: "B" }),
      ]
    );
    const tasks = makeTable(
      "tblTasks",
      [
        makeField({ id: "task", type: DatabaseFieldType.SingleLineText }),
        makeField({
          id: "projects",
          type: DatabaseFieldType.Link,
          options: { foreignTableId: "tblProjects", relationship: "manyMany" },
        }),
        makeField({
          id: "budgets",
          type: DatabaseFieldType.Number,
          isLookup: true,
          isMultipleCellValue: true,
          lookupOptions: {
            foreignTableId: "tblProjects",
            linkFieldId: "projects",
            lookupFieldId: "budget",
          },
        }),
        makeField({
          id: "firstBudget",
          type: DatabaseFieldType.Number,
          isLookup: true,
          isMultipleCellValue: false,
          lookupOptions: {
            foreignTableId: "tblProjects",
            linkFieldId: "projects",
            lookupFieldId: "budget",
          },
        }),
      ],
      [makeRecord("recT", { projects: [{ id: "recB" }, { id: "recA" }] })]
    );
    const cells = computeBase([tasks, projects], context).record(
      "tblTasks",
      "recT"
    )?.cells;
    expect(cells?.budgets).toEqual([10]);
    expect(cells?.firstBudget).toBe(10);
  });

  it("uses the formula's own zone for TODAY(), else the reader's", () => {
    const table = makeTable(
      "tblZone",
      [
        makeField({ id: "name", type: DatabaseFieldType.SingleLineText }),
        formulaField("tokyo", 'DATETIME_FORMAT(NOW(), "HH:mm")', "string", {
          options: { timeZone: "Asia/Tokyo" },
        }),
        makeField({
          id: "reader",
          type: DatabaseFieldType.Formula,
          isComputed: true,
          cellValueType: "string",
          options: { expression: 'DATETIME_FORMAT(NOW(), "HH:mm")' },
        }),
      ],
      [makeRecord("rec1", { name: "a" })]
    );
    const cells = computeBase([table], context).record(
      "tblZone",
      "rec1"
    )?.cells;
    expect(cells?.tokyo).toBe("19:00");
    expect(cells?.reader).toBe("12:00");
  });
});

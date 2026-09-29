import type { DatabaseCellValue } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { ComputedRecord } from "./contract";
import { aggregate } from "./statistics";
import { PARIS, makeField, makeRecord, makeTable } from "./testFixtures";

const table = makeTable("tblStats", [
  makeField({ id: "n", type: DatabaseFieldType.Number }),
  makeField({ id: "c", type: DatabaseFieldType.Checkbox }),
  makeField({
    id: "d",
    type: DatabaseFieldType.Date,
    options: {
      formatting: { date: "YYYY-MM-DD", time: "None", timeZone: PARIS },
    },
  }),
  makeField({ id: "p", type: DatabaseFieldType.User }),
  makeField({ id: "t", type: DatabaseFieldType.MultipleSelect }),
  makeField({ id: "f", type: DatabaseFieldType.Attachment }),
]);
const file = (size: number) => ({
  id: `act${size}`,
  name: "f",
  mimetype: "text/plain",
  size,
});
const rows: Record<string, DatabaseCellValue>[] = [
  {
    n: 1,
    c: true,
    d: "2025-01-10T00:00:00.000Z",
    p: { id: "u1", title: "Ada" },
    t: ["a", "b"],
    f: [file(10)],
  },
  {
    n: 3,
    d: "2025-03-25T12:00:00.000Z",
    p: { id: "u1", title: "Ada" },
    t: ["a"],
  },
  { n: null, c: true, p: { id: "u2", title: "Bob" }, f: [file(5), file(1)] },
  {},
];
const records: ComputedRecord[] = rows.map((cells, index) => ({
  row: makeRecord(`rec${index}`, {}),
  cells,
}));

const stat = (fieldId: string, func: Parameters<typeof aggregate>[2][string]) =>
  aggregate(table, records, { [fieldId]: func })[fieldId].value;

describe("aggregate", () => {
  it("counts rows, empty, filled and unique values", () => {
    expect(stat("n", "count")).toBe(4);
    expect(stat("n", "empty")).toBe(2);
    expect(stat("n", "filled")).toBe(2);
    expect(stat("p", "unique")).toBe(2);
    expect(stat("t", "unique")).toBe(2);
    expect(stat("n", "percentEmpty")).toBe(50);
    expect(stat("p", "percentFilled")).toBe(75);
    expect(stat("p", "percentUnique")).toBe(50);
  });

  it("sums, averages and finds extremes of numbers", () => {
    expect(stat("n", "sum")).toBe(4);
    expect(stat("n", "average")).toBe(2);
    expect(stat("n", "max")).toBe(3);
    expect(stat("n", "min")).toBe(1);
    expect(aggregate(table, [], { n: "sum" }).n.value).toBeNull();
  });

  it("counts checked and unchecked boxes", () => {
    expect(stat("c", "checked")).toBe(2);
    expect(stat("c", "unChecked")).toBe(2);
    expect(stat("c", "percentChecked")).toBe(50);
    expect(stat("c", "percentUnChecked")).toBe(50);
  });

  it("gives dates as ISO 8601 and date ranges in whole days and months", () => {
    expect(stat("d", "earliestDate")).toBe("2025-01-10T00:00:00.000Z");
    expect(stat("d", "latestDate")).toBe("2025-03-25T12:00:00.000Z");
    expect(stat("d", "max")).toBe("2025-03-25T12:00:00.000Z");
    expect(stat("d", "dateRangeOfDays")).toBe(74);
    expect(stat("d", "dateRangeOfMonths")).toBe(2);
    expect(aggregate(table, [], { d: "dateRangeOfMonths" }).d.value).toBe(0);
    expect(aggregate(table, [], { d: "dateRangeOfDays" }).d.value).toBeNull();
  });

  it("sums attachment sizes and answers null for an unknown field", () => {
    expect(stat("f", "totalAttachmentSize")).toBe(16);
    expect(aggregate(table, records, { gone: "count" })).toEqual({
      gone: { value: null },
    });
    expect(aggregate(table, [], { n: "percentEmpty" }).n.value).toBe(0);
  });
});

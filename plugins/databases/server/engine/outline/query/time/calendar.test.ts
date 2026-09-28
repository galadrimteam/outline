import {
  addUnits,
  daysInMonth,
  diffUnits,
  endOf,
  isoWeek,
  parseTimeUnit,
  startOf,
} from "./calendar";

const PARIS = "Europe/Paris";
const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

describe("calendar", () => {
  it("reads unit names", () => {
    expect(parseTimeUnit("Days ", "second")).toBe("day");
    expect(parseTimeUnit("hrs", "second")).toBe("hour");
    expect(parseTimeUnit("fortnight", "day")).toBe("day");
    expect(parseTimeUnit(undefined, "second")).toBe("second");
  });

  it("finds the start and end of units in a zone, weeks from Monday", () => {
    const sunday = at("2025-06-01T21:45:00Z");
    expect(iso(startOf(sunday, "day", PARIS))).toBe("2025-05-31T22:00:00.000Z");
    expect(iso(startOf(sunday, "week", PARIS))).toBe(
      "2025-05-25T22:00:00.000Z"
    );
    expect(iso(startOf(sunday, "month", PARIS))).toBe(
      "2025-05-31T22:00:00.000Z"
    );
    expect(iso(startOf(sunday, "quarter", PARIS))).toBe(
      "2025-03-31T22:00:00.000Z"
    );
    expect(iso(startOf(sunday, "year", PARIS))).toBe(
      "2024-12-31T23:00:00.000Z"
    );
    expect(iso(endOf(sunday, "day", PARIS))).toBe("2025-06-01T21:59:59.999Z");
    expect(iso(endOf(at("2025-03-30T12:00:00Z"), "day", PARIS))).toBe(
      "2025-03-30T21:59:59.999Z"
    );
  });

  it("adds days on the wall clock and months to the last day of short months", () => {
    expect(iso(addUnits(at("2025-03-29T11:00:00Z"), 1, "day", PARIS))).toBe(
      "2025-03-30T10:00:00.000Z"
    );
    expect(iso(addUnits(at("2025-03-29T11:00:00Z"), 24, "hour", PARIS))).toBe(
      "2025-03-30T11:00:00.000Z"
    );
    expect(iso(addUnits(at("2024-01-31T12:00:00Z"), 1, "month", PARIS))).toBe(
      "2024-02-29T12:00:00.000Z"
    );
    expect(iso(addUnits(at("2024-02-29T12:00:00Z"), 1, "year", "UTC"))).toBe(
      "2025-02-28T12:00:00.000Z"
    );
    expect(iso(addUnits(at("2025-01-15T12:00:00Z"), 1, "quarter", "UTC"))).toBe(
      "2025-04-15T12:00:00.000Z"
    );
  });

  it("measures differences on the wall clock, whole months and years", () => {
    const start = at("2025-03-18T23:00:00Z");
    const end = at("2025-05-15T22:00:00Z");
    expect(diffUnits(end, start, "day", PARIS)).toBe(58);
    expect(diffUnits(start, end, "day", PARIS)).toBe(-58);
    expect(diffUnits(end, start, "month", PARIS)).toBe(1);
    expect(
      diffUnits(
        at("2025-02-28T12:00:00Z"),
        at("2025-01-31T12:00:00Z"),
        "month",
        "UTC"
      )
    ).toBe(1);
    expect(
      diffUnits(
        at("2025-02-27T12:00:00Z"),
        at("2025-01-31T12:00:00Z"),
        "month",
        "UTC"
      )
    ).toBe(0);
    expect(
      diffUnits(
        at("2027-06-01T00:00:00Z"),
        at("2025-12-01T00:00:00Z"),
        "year",
        "UTC"
      )
    ).toBe(1);
    expect(
      diffUnits(
        at("2025-07-01T00:00:00Z"),
        at("2025-01-01T00:00:00Z"),
        "quarter",
        "UTC"
      )
    ).toBe(2);
  });

  it("numbers ISO weeks and knows month lengths", () => {
    expect(isoWeek(at("2025-01-01T12:00:00Z"), PARIS)).toBe(1);
    expect(isoWeek(at("2024-12-30T12:00:00Z"), PARIS)).toBe(1);
    expect(isoWeek(at("2021-01-03T12:00:00Z"), PARIS)).toBe(53);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 12)).toBe(31);
  });
});

import { parseInstant, parseWithFormat } from "./parse";

const PARIS = "Europe/Paris";
const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

describe("parseInstant", () => {
  it("reads ISO 8601 with a zone as it is, without one in the zone", () => {
    expect(iso(parseInstant("2025-03-18T23:00:00.000Z", PARIS))).toBe(
      "2025-03-18T23:00:00.000Z"
    );
    expect(iso(parseInstant("2025-03-19T10:00:00+01:00", PARIS))).toBe(
      "2025-03-19T09:00:00.000Z"
    );
    expect(iso(parseInstant("2025-03-19", PARIS))).toBe(
      "2025-03-18T23:00:00.000Z"
    );
    expect(iso(parseInstant("2025/7/1 14:30", PARIS))).toBe(
      "2025-07-01T12:30:00.000Z"
    );
    expect(iso(parseInstant("2025-07-01T09:30:15.5", PARIS))).toBe(
      "2025-07-01T07:30:15.500Z"
    );
  });

  it("reads long French and English dates and European dates", () => {
    expect(iso(parseInstant("1 juillet 2025", PARIS))).toBe(
      "2025-06-30T22:00:00.000Z"
    );
    expect(iso(parseInstant("18 Février 2025 14:30", PARIS))).toBe(
      "2025-02-18T13:30:00.000Z"
    );
    expect(iso(parseInstant("1 sept. 2025", PARIS))).toBe(
      "2025-08-31T22:00:00.000Z"
    );
    expect(iso(parseInstant("July 1, 2025", PARIS))).toBe(
      "2025-06-30T22:00:00.000Z"
    );
    expect(iso(parseInstant("19/3/2025", PARIS))).toBe(
      "2025-03-18T23:00:00.000Z"
    );
  });

  it("tries the given formats first", () => {
    expect(iso(parseInstant("3/19/2025", PARIS, ["M/D/YYYY"]))).toBe(
      "2025-03-18T23:00:00.000Z"
    );
    expect(iso(parseInstant("3/19/2025", PARIS))).toBeNull();
  });

  it("refuses what is no date", () => {
    expect(parseInstant("", PARIS)).toBeNull();
    expect(parseInstant("demain", PARIS)).toBeNull();
    expect(parseInstant("2025-02-30", PARIS)).toBeNull();
    expect(parseInstant("31 brumaire 2025", PARIS)).toBeNull();
  });
});

describe("parseWithFormat", () => {
  it("reads dayjs tokens, literals, twelve-hour times and offsets", () => {
    expect(iso(parseWithFormat("18/03/2025", "DD/MM/YYYY", PARIS))).toBe(
      "2025-03-17T23:00:00.000Z"
    );
    expect(iso(parseWithFormat("2:05 PM", "h:mm A", "UTC"))).toBe(
      "1970-01-01T14:05:00.000Z"
    );
    expect(
      iso(parseWithFormat("le 1er juillet 25", "[le] Do MMMM YY", PARIS))
    ).toBe("2025-06-30T22:00:00.000Z");
    expect(
      iso(
        parseWithFormat("2025-07-01 09:00 +05:00", "YYYY-MM-DD HH:mm Z", PARIS)
      )
    ).toBe("2025-07-01T04:00:00.000Z");
    expect(parseWithFormat("13:00 PM", "hh:mm A", PARIS)).toBeNull();
    expect(parseWithFormat("2025-13-01", "YYYY-MM-DD", PARIS)).toBeNull();
  });
});

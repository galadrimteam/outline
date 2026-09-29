import { formatInstant, monthNames } from "./format";

const PARIS = "Europe/Paris";
const instant = Date.parse("2025-07-01T07:05:09.042Z");

describe("formatInstant", () => {
  it("writes dayjs tokens on the wall clock of the zone, in French", () => {
    expect(formatInstant(instant, "YYYY-MM-DD HH:mm:ss.SSS", PARIS)).toBe(
      "2025-07-01 09:05:09.042"
    );
    expect(formatInstant(instant, "D MMMM YYYY", PARIS)).toBe("1 juillet 2025");
    expect(formatInstant(instant, "dddd Do MMM YY", PARIS)).toBe(
      "mardi 1er juil. 25"
    );
    expect(formatInstant(instant, "dd d", PARIS)).toBe("ma 2");
    expect(formatInstant(instant, "h:mm A a", PARIS)).toBe("9:05 AM am");
    expect(formatInstant(instant, "hh [h] mm", PARIS)).toBe("09 h 05");
    expect(formatInstant(instant, "Z ZZ Q", PARIS)).toBe("+02:00 +0200 3");
    expect(formatInstant(instant, "M/D/YYYY", "America/New_York")).toBe(
      "7/1/2025"
    );
  });

  it("writes English names and ordinals", () => {
    expect(formatInstant(instant, "MMMM Do, YYYY", PARIS, "en")).toBe(
      "July 1st, 2025"
    );
    expect(
      formatInstant(Date.parse("2025-07-12T12:00:00Z"), "Do", PARIS, "en")
    ).toBe("12th");
    expect(
      formatInstant(Date.parse("2025-07-23T12:00:00Z"), "Do", PARIS, "en")
    ).toBe("23rd");
  });

  it("lists month names", () => {
    expect(monthNames("fr").months[1]).toBe("février");
    expect(monthNames("en").monthsShort[8]).toBe("Sep");
  });
});

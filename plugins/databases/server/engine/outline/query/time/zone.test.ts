import {
  fromWall,
  safeTimeZone,
  toWall,
  wallOf,
  wallParts,
  zoneOffset,
} from "./zone";

const HOUR = 3_600_000;

describe("zones", () => {
  it("knows the offset of Paris in winter, in summer, and across the changes", () => {
    expect(zoneOffset(Date.parse("2025-01-15T12:00:00Z"), "Europe/Paris")).toBe(
      HOUR
    );
    expect(zoneOffset(Date.parse("2025-07-15T12:00:00Z"), "Europe/Paris")).toBe(
      2 * HOUR
    );
    expect(zoneOffset(Date.parse("2025-03-30T00:59:59Z"), "Europe/Paris")).toBe(
      HOUR
    );
    expect(zoneOffset(Date.parse("2025-03-30T01:00:00Z"), "Europe/Paris")).toBe(
      2 * HOUR
    );
    expect(zoneOffset(Date.parse("2025-10-26T00:59:59Z"), "Europe/Paris")).toBe(
      2 * HOUR
    );
    expect(zoneOffset(Date.parse("2025-10-26T01:00:00Z"), "Europe/Paris")).toBe(
      HOUR
    );
  });

  it("handles zones whose changes fall on the half hour", () => {
    const zone = "America/St_Johns";
    const before = Date.parse("2025-03-09T05:29:00Z");
    const after = Date.parse("2025-03-09T05:31:00Z");
    expect(zoneOffset(before, zone)).toBe(-3.5 * HOUR);
    expect(zoneOffset(after, zone)).toBe(-2.5 * HOUR);
  });

  it("goes from instants to wall clocks and back", () => {
    const instant = Date.parse("2025-06-01T21:45:00Z");
    const wall = toWall(instant, "Europe/Paris");
    expect(new Date(wall).toISOString()).toBe("2025-06-01T23:45:00.000Z");
    expect(fromWall(wall, "Europe/Paris")).toBe(instant);
    expect(wallParts(instant, "Europe/Paris")).toMatchObject({
      year: 2025,
      month: 6,
      day: 1,
      hour: 23,
      minute: 45,
      weekday: 0,
    });
  });

  it("moves a wall time skipped by the spring change forward", () => {
    const skipped = wallOf(2025, 3, 30, 2, 30);
    expect(new Date(fromWall(skipped, "Europe/Paris")).toISOString()).toBe(
      "2025-03-30T01:30:00.000Z"
    );
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(safeTimeZone("Mars/Olympus")).toBe("UTC");
    expect(safeTimeZone(undefined)).toBe("UTC");
    expect(safeTimeZone("Europe/Paris")).toBe("Europe/Paris");
  });
});

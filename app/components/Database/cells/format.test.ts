import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import {
  calendarDayToISO,
  cellValueToText,
  datePartsInZone,
  formatDateValue,
  formatNumber,
  hrefForText,
  isEmptyCellValue,
  isoToCalendarDay,
  numberInputValue,
  parseNumberInput,
  shortUrl,
  toArray,
  zonedPartsToISO,
} from "./format";

const spaces = (text: string) => text.replace(/[  ]/g, " ");

const field = (patch: Partial<DatabaseField>): DatabaseField => ({
  id: "fld",
  name: "Field",
  type: DatabaseFieldType.SingleLineText,
  options: {},
  isPrimary: false,
  isComputed: false,
  isLookup: false,
  cellValueType: "string",
  isMultipleCellValue: false,
  ...patch,
});

describe("toArray", () => {
  it("normalises empty, single and multiple values", () => {
    expect(toArray(null)).toEqual([]);
    expect(toArray(undefined)).toEqual([]);
    expect(toArray("a")).toEqual(["a"]);
    expect(toArray(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("isEmptyCellValue", () => {
  it("treats blank text, empty lists and unchecked boxes as empty", () => {
    expect(isEmptyCellValue(null)).toBe(true);
    expect(isEmptyCellValue("  ")).toBe(true);
    expect(isEmptyCellValue([])).toBe(true);
    expect(isEmptyCellValue(false)).toBe(true);
    expect(isEmptyCellValue(0)).toBe(false);
    expect(isEmptyCellValue("x")).toBe(false);
    expect(isEmptyCellValue(true)).toBe(false);
  });
});

describe("formatNumber", () => {
  it("applies the precision of decimals", () => {
    expect(
      formatNumber(1234.5, { type: "decimal", precision: 2 }, "en-US")
    ).toBe("1,234.50");
    expect(
      spaces(formatNumber(1234.5, { type: "decimal", precision: 0 }, "fr-FR"))
    ).toBe("1 235");
  });

  it("leaves thousands together when the field says so, as Notion's « Number »", () => {
    expect(
      formatNumber(2775, { type: "decimal", grouping: false }, "fr-FR")
    ).toBe("2775");
    expect(
      spaces(
        formatNumber(
          12.345,
          { type: "percent", precision: 0, grouping: false },
          "fr-FR"
        )
      )
    ).toBe("1235 %");
    expect(spaces(formatNumber(2775, { type: "decimal" }, "fr-FR"))).toBe(
      "2 775"
    );
  });

  it("keeps every decimal without precision", () => {
    expect(formatNumber(0.125, undefined, "en-US")).toBe("0.125");
  });

  it("shows percents from ratios", () => {
    expect(formatNumber(0.5, { type: "percent", precision: 0 }, "en-US")).toBe(
      "50%"
    );
    expect(
      spaces(formatNumber(0.125, { type: "percent", precision: 1 }, "fr-FR"))
    ).toBe("12,5 %");
  });

  it("places the currency symbol as the locale does", () => {
    expect(
      formatNumber(
        -1234.5,
        { type: "currency", precision: 2, symbol: "$" },
        "en-US"
      )
    ).toBe("-$1,234.50");
    expect(
      spaces(
        formatNumber(
          1234.5,
          { type: "currency", precision: 2, symbol: "€" },
          "fr-FR"
        )
      )
    ).toBe("1 234,50 €");
  });
});

describe("parseNumberInput", () => {
  it("accepts commas and dots as decimal separators", () => {
    expect(parseNumberInput("1 234,5")).toBe(1234.5);
    expect(parseNumberInput("1,234.5")).toBe(1234.5);
    expect(parseNumberInput("-3.25")).toBe(-3.25);
  });

  it("returns null for empty or invalid text", () => {
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("abc")).toBeNull();
  });

  it("stores percents as ratios", () => {
    expect(parseNumberInput("12,5 %", { type: "percent" })).toBe(0.125);
  });

  it("ignores the currency symbol", () => {
    expect(parseNumberInput("12 €", { type: "currency", symbol: "€" })).toBe(
      12
    );
  });
});

describe("numberInputValue", () => {
  it("edits percents as percentages", () => {
    expect(numberInputValue(0.125, { type: "percent" })).toBe("12.5");
    expect(numberInputValue(0.07, { type: "percent" })).toBe("7");
    expect(numberInputValue(null)).toBe("");
  });
});

describe("zoned dates", () => {
  it("round-trips wall-clock parts in a time zone", () => {
    const parts = { year: 2026, month: 9, day: 25, hour: 0, minute: 0 };
    const iso = zonedPartsToISO(parts, "Europe/Paris");
    expect(iso).toBe("2026-09-24T22:00:00.000Z");
    expect(datePartsInZone(new Date(iso), "Europe/Paris")).toEqual(parts);
  });

  it("handles the day daylight saving time starts", () => {
    const iso = zonedPartsToISO(
      { year: 2026, month: 3, day: 29, hour: 12, minute: 0 },
      "Europe/Paris"
    );
    expect(iso).toBe("2026-03-29T10:00:00.000Z");
  });

  it("converts between stored dates and calendar days", () => {
    const day = isoToCalendarDay("2026-09-24T22:00:00.000Z", "Europe/Paris");
    expect(day?.getFullYear()).toBe(2026);
    expect(day?.getMonth()).toBe(8);
    expect(day?.getDate()).toBe(25);
    expect(
      calendarDayToISO(
        new Date(2026, 8, 25),
        { hour: 14, minute: 30 },
        "Europe/Paris"
      )
    ).toBe("2026-09-25T12:30:00.000Z");
  });
});

describe("formatDateValue", () => {
  const iso = "2026-09-24T22:00:00.000Z";

  it("spells the month in the reader's language for long formats", () => {
    expect(
      formatDateValue(
        iso,
        { date: "D MMMM YYYY", timeZone: "Europe/Paris" },
        "fr-FR"
      )
    ).toBe("25 septembre 2026");
    expect(
      formatDateValue(
        iso,
        { date: "MMMM D, YYYY", timeZone: "Europe/Paris" },
        "en-US"
      )
    ).toBe("September 25, 2026");
  });

  it("defaults to the long format of the locale", () => {
    expect(formatDateValue(iso, { timeZone: "Europe/Paris" }, "fr-FR")).toBe(
      "25 septembre 2026"
    );
  });

  it("follows numeric presets and times", () => {
    expect(
      formatDateValue(
        "2026-09-25T12:05:00.000Z",
        { date: "YYYY-MM-DD", time: "HH:mm", timeZone: "Europe/Paris" },
        "fr-FR"
      )
    ).toBe("2026-09-25 14:05");
    expect(
      formatDateValue(
        "2026-09-25T12:05:00.000Z",
        { date: "D/M/YYYY", time: "hh:mm A", timeZone: "Europe/Paris" },
        "en-US"
      )
    ).toBe("25/9/2026 02:05 PM");
  });

  it("returns nothing for invalid dates", () => {
    expect(formatDateValue("nope")).toBe("");
  });
});

describe("hrefForText", () => {
  it("builds safe links", () => {
    expect(hrefForText("galadrim.fr", "url")).toBe("https://galadrim.fr");
    expect(hrefForText("http://a.b", "url")).toBe("http://a.b");
    expect(hrefForText("javascript:alert(1)", "url")).toBeUndefined();
    expect(hrefForText("a@b.fr", "email")).toBe("mailto:a@b.fr");
    expect(hrefForText("not an email", "email")).toBeUndefined();
    expect(hrefForText("+33 6 12 34 56 78", "phone")).toBe("tel:+33612345678");
    expect(hrefForText("plain", undefined)).toBeUndefined();
  });
});

describe("cellValueToText", () => {
  it("joins multiple values", () => {
    expect(
      cellValueToText(
        field({
          type: DatabaseFieldType.MultipleSelect,
          isMultipleCellValue: true,
        }),
        ["A", "B"]
      )
    ).toBe("A, B");
  });

  it("reads people and linked rows by title", () => {
    expect(
      cellValueToText(field({ type: DatabaseFieldType.User }), {
        id: "usr",
        title: "Ada",
      })
    ).toBe("Ada");
  });

  it("formats numbers and dates of computed fields", () => {
    expect(
      cellValueToText(
        field({
          type: DatabaseFieldType.Formula,
          cellValueType: "number",
          options: { formatting: { type: "decimal", precision: 1 } },
        }),
        2,
        "en-US"
      )
    ).toBe("2.0");
    expect(
      cellValueToText(
        field({
          type: DatabaseFieldType.Rollup,
          cellValueType: "dateTime",
          options: { formatting: { date: "YYYY-MM-DD", timeZone: "UTC" } },
        }),
        "2026-01-02T00:00:00.000Z"
      )
    ).toBe("2026-01-02");
  });
});

describe("shortUrl", () => {
  it("cuts a long URL in the middle like Notion's page properties", () => {
    expect(
      shortUrl(
        "https://www.figma.com/design/lRvEEsNv45YUtjMuOqTnFl/Maquettes---Mission-Grande-Ecole?node-id=4479-16561&m=dev"
      )
    ).toEqual({ host: "figma.com", rest: "/des…&m=dev" });
  });

  it("keeps a short path whole and drops a bare slash", () => {
    expect(shortUrl("https://galadrim.fr/")).toEqual({
      host: "galadrim.fr",
      rest: "",
    });
    expect(shortUrl("http://example.com/a/b")).toEqual({
      host: "example.com",
      rest: "/a/b",
    });
  });

  it("gives nothing for what is not an http(s) URL", () => {
    expect(shortUrl("mailto:someone@example.com")).toBeUndefined();
    expect(shortUrl("not a url")).toBeUndefined();
  });
});

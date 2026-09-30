import { splitDateMentions } from "./dateMention";

describe("splitDateMentions", () => {
  it("finds the date mention at the end of a migrated title", () => {
    expect(splitDateMentions("Point de suivi @25 août 2026")).toEqual([
      { text: "Point de suivi ", isDate: false },
      { text: "@25 août 2026", isDate: true },
    ]);
  });

  it("keeps a time and a range with the date", () => {
    expect(
      splitDateMentions("Atelier @3 décembre 2025 14:00 → 5 décembre 2025 bis")
    ).toEqual([
      { text: "Atelier ", isDate: false },
      { text: "@3 décembre 2025 14:00 → 5 décembre 2025", isDate: true },
      { text: " bis", isDate: false },
    ]);
  });

  it("reads the English dates of Notion's export", () => {
    expect(splitDateMentions("@December 3, 2025 review")).toEqual([
      { text: "@December 3, 2025", isDate: true },
      { text: " review", isDate: false },
    ]);
  });

  it("leaves other at signs and plain titles alone", () => {
    expect(splitDateMentions("Mail @bob le 25 août")).toEqual([
      { text: "Mail @bob le 25 août", isDate: false },
    ]);
    expect(splitDateMentions("")).toEqual([{ text: "", isDate: false }]);
  });
});

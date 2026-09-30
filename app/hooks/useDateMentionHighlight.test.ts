import { dateMentionRanges } from "./useDateMentionHighlight";

describe("dateMentionRanges", () => {
  it("covers the date mention of a title", () => {
    const element = document.createElement("span");
    element.textContent = "Sprint review @21 mai 2025";

    const ranges = dateMentionRanges(element);

    expect(ranges.map((range) => range.toString())).toEqual(["@21 mai 2025"]);
  });

  it("follows a title split over several text nodes", () => {
    const element = document.createElement("span");
    element.append("Point @2 sept", "embre 2026 et ", "@3 mars 2026");

    const ranges = dateMentionRanges(element);

    expect(ranges.map((range) => range.toString())).toEqual([
      "@2 septembre 2026",
      "@3 mars 2026",
    ]);
  });

  it("finds nothing in a plain title", () => {
    const element = document.createElement("span");
    element.textContent = "Kick off conception";

    expect(dateMentionRanges(element)).toEqual([]);
  });
});

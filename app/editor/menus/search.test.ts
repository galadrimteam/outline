import {
  matchesMenuSearch,
  menuSearchScore,
  normalizeSearchText,
} from "./search";

describe("normalizeSearchText", () => {
  it("ignores case, accents, curly apostrophes and extra spaces", () => {
    expect(normalizeSearchText("  Liste  à Puces ")).toBe("liste a puces");
    expect(normalizeSearchText("Aujourd’hui")).toBe("aujourd'hui");
    expect(normalizeSearchText("Équation – intégrée")).toBe(
      "equation – integree"
    );
  });
});

describe("matchesMenuSearch", () => {
  const item = { name: "bullet_list", title: "Liste à puces", keywords: "ul" };

  it("matches every word of the search, in any field and any order", () => {
    expect(matchesMenuSearch(item, "liste a puces")).toBe(true);
    expect(matchesMenuSearch(item, "puces liste")).toBe(true);
    expect(matchesMenuSearch(item, "LISTE À")).toBe(true);
    expect(matchesMenuSearch(item, "bullet")).toBe(true);
    expect(matchesMenuSearch(item, "ul")).toBe(true);
  });

  it("passes over a dash between words, unless it is the whole search", () => {
    expect(matchesMenuSearch(item, "liste - puces")).toBe(true);
    expect(matchesMenuSearch(item, "---")).toBe(false);
    expect(matchesMenuSearch({ keywords: "divider ---" }, "---")).toBe(true);
  });

  it("fails when one word is missing", () => {
    expect(matchesMenuSearch(item, "liste numérotée")).toBe(false);
  });

  it("matches everything on an empty search", () => {
    expect(matchesMenuSearch(item, "  ")).toBe(true);
  });
});

describe("menuSearchScore", () => {
  it("ranks the exact title, then an exact keyword, then a fuzzy title", () => {
    const title = menuSearchScore({ title: "Titre 1" }, "titre 1");
    const keyword = menuSearchScore(
      { title: "Big heading", keywords: "h1 titre1" },
      "titre 1"
    );
    const fuzzy = menuSearchScore({ title: "Titre 1 à bascule" }, "titre 1");
    expect(title).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(fuzzy);
    expect(fuzzy).toBeGreaterThan(0);
  });

  it("puts an embed behind a block answering as well", () => {
    const block = { title: "Vue calendrier", keywords: "calendar" };
    const embed = { title: "Google Calendar", keywords: "calendar" };
    expect(menuSearchScore(block, "calendar")).toBeGreaterThan(
      menuSearchScore(embed, "calendar", { embed: true })
    );
  });

  it("is 0 without a search", () => {
    expect(menuSearchScore({ title: "Page" }, "")).toBe(0);
  });
});

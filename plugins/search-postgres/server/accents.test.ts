import {
  accentInsensitivePattern,
  accentInsensitiveWordPattern,
} from "./accents";

describe("accentInsensitivePattern", () => {
  it("matches accented text for a query typed without accents", () => {
    const regex = new RegExp(accentInsensitivePattern("securite"), "i");

    expect("La Sécurité avant tout".search(regex)).toBe(3);
    expect(regex.test("SÉCURITÉ")).toBe(true);
    expect(regex.test("securite")).toBe(true);
  });

  it("matches unaccented text for a query typed with accents", () => {
    const regex = new RegExp(accentInsensitivePattern("Réunion"), "i");

    expect(regex.test("compte rendu de reunion")).toBe(true);
    expect(regex.test("compte rendu de réunion")).toBe(true);
  });

  it("handles a decomposed query", () => {
    const regex = new RegExp(
      accentInsensitivePattern("réunion".normalize("NFD")),
      "i"
    );

    expect(regex.test("Réunion")).toBe(true);
  });

  it("escapes regular expression syntax", () => {
    const regex = new RegExp(accentInsensitivePattern("c++ (v2)?"), "i");

    expect(regex.test("about C++ (v2)? yes")).toBe(true);
    expect(regex.test("about c (v2) yes")).toBe(false);
  });

  it("does not match other letters", () => {
    const regex = new RegExp(accentInsensitivePattern("cote"), "i");

    expect(regex.test("côté")).toBe(true);
    expect(regex.test("cite")).toBe(false);
  });
});

describe("accentInsensitiveWordPattern", () => {
  const highlight = (text: string, word: string) =>
    text.replace(
      new RegExp(accentInsensitiveWordPattern(word), "gi"),
      "<b>$&</b>"
    );

  it("matches words that start or end with an accented letter", () => {
    expect(highlight("Un été à l'école", "ete")).toBe(
      "Un <b>été</b> à l'école"
    );
    expect(highlight("La sécurité.", "securite")).toBe("La <b>sécurité</b>.");
    expect(highlight("École, écoles", "ecole")).toBe("<b>École</b>, écoles");
  });

  it("matches whole words only", () => {
    expect(highlight("test tester détester", "test")).toBe(
      "<b>test</b> tester détester"
    );
  });
});

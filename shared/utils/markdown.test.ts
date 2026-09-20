import { replaceMarkdownLinks } from "./markdown";

describe("replaceMarkdownLinks", () => {
  const toUpper = (href: string) => href.toUpperCase();

  it("replaces the destination of a link, leaving its label", () => {
    expect(replaceMarkdownLinks("see [other](./other.md)", toUpper)).toBe(
      "see [other](./OTHER.MD)"
    );
  });

  it("replaces the destination of an image", () => {
    expect(replaceMarkdownLinks("![alt](assets/a.png)", toUpper)).toBe(
      "![alt](ASSETS/A.PNG)"
    );
  });

  it("preserves a link title", () => {
    expect(
      replaceMarkdownLinks('![alt](assets/a.png "A caption")', toUpper)
    ).toBe('![alt](ASSETS/A.PNG "A caption")');
  });

  it("understands an angle bracketed destination", () => {
    expect(replaceMarkdownLinks("![alt](<assets/my a.png>)", toUpper)).toBe(
      "![alt](ASSETS/MY A.PNG)"
    );
  });

  it("preserves a title after an angle bracketed destination", () => {
    expect(replaceMarkdownLinks('[x](<my doc.md> "Title")', toUpper)).toBe(
      '[x](MY DOC.MD "Title")'
    );
  });

  it("leaves a link alone when the replacer returns undefined", () => {
    expect(replaceMarkdownLinks("[x](./y.md)", () => undefined)).toBe(
      "[x](./y.md)"
    );
  });

  it("leaves an unterminated angle bracket alone", () => {
    expect(replaceMarkdownLinks("[x](<unclosed)", toUpper)).toBe(
      "[x](<unclosed)"
    );
  });

  it("replaces every link in the text", () => {
    expect(replaceMarkdownLinks("[a](one.md) and [b](two.md)", toUpper)).toBe(
      "[a](ONE.MD) and [b](TWO.MD)"
    );
  });

  // galadrim: balanced parentheses in the destination
  it("replaces a destination that contains balanced parentheses", () => {
    expect(
      replaceMarkdownLinks("[Page](Folder/Page%20(v2)%20abc.md)", toUpper)
    ).toBe("[Page](FOLDER/PAGE%20(V2)%20ABC.MD)");
  });

  it("keeps links apart when one sits inside parentheses", () => {
    expect(
      replaceMarkdownLinks("([a](one(1).md), then [b](two.md)) end", toUpper)
    ).toBe("([a](ONE(1).MD), then [b](TWO.MD)) end");
  });

  it("preserves a title next to a destination with parentheses", () => {
    expect(replaceMarkdownLinks('[x](doc(1).md "Title (a)")', toUpper)).toBe(
      '[x](DOC(1).MD "Title (a)")'
    );
  });

  // galadrim: Notion cuts a long page or file name at a fixed length, and the
  // cut often falls inside a parenthesis. The first ")" then closes the link,
  // as it did upstream, so the page is still resolved on import.
  it("replaces a destination whose parentheses do not balance", () => {
    expect(
      replaceMarkdownLinks(
        "[Forum](Forums/04%2011%20Forum%20(Mines,%20PSL,%20ab12.md) et la suite",
        toUpper
      )
    ).toBe(
      "[Forum](FORUMS/04%2011%20FORUM%20(MINES,%20PSL,%20AB12.MD) et la suite"
    );
  });

  it("stops an unbalanced destination at the end of its line", () => {
    expect(
      replaceMarkdownLinks("[x](doc(1.md\n\nUn paragraphe (a).", toUpper)
    ).toBe("[x](doc(1.md\n\nUn paragraphe (a).");
  });

  it("replaces the links that follow an unbalanced one", () => {
    expect(
      replaceMarkdownLinks("[a](un%20(1.md) puis [b](deux.md)", toUpper)
    ).toBe("[a](UN%20(1.MD) puis [b](DEUX.MD)");
  });
});

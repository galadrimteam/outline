import type { ProsemirrorData } from "../../types";
import { hasDatabaseEmbed, TEABLE_FRAME_REGEX } from "./teable";

const doc = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

const paragraph = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "paragraph",
  content,
});

const embed = (href: string): ProsemirrorData => ({
  type: "embed",
  attrs: { href },
});

describe("TEABLE_FRAME_REGEX", () => {
  it("matches our /framed wrapper and public share links", () => {
    expect(
      TEABLE_FRAME_REGEX.test(
        "https://teable.notion-exit.galadrim.fr/framed?u=/base/bse1/tbl1/viw1"
      )
    ).toBe(true);
    expect(
      TEABLE_FRAME_REGEX.test("https://teable.example.com/share/shr123")
    ).toBe(true);
  });

  it("does not match an unrelated host or path", () => {
    expect(TEABLE_FRAME_REGEX.test("https://example.com/framed?u=/x")).toBe(
      false
    );
    expect(
      TEABLE_FRAME_REGEX.test("https://teable.notion-exit.galadrim.fr/")
    ).toBe(false);
  });
});

describe("hasDatabaseEmbed", () => {
  it("returns false for a missing or empty document", () => {
    expect(hasDatabaseEmbed(undefined)).toBe(false);
    expect(hasDatabaseEmbed(null)).toBe(false);
    expect(hasDatabaseEmbed(doc(paragraph()))).toBe(false);
  });

  it("returns true when the body is a Teable base embed", () => {
    expect(
      hasDatabaseEmbed(
        doc(embed("https://teable.notion-exit.galadrim.fr/framed?u=/base/b"))
      )
    ).toBe(true);
  });

  it("finds the embed nested under other blocks", () => {
    expect(
      hasDatabaseEmbed(
        doc(
          paragraph({ type: "text", text: "A database page" }),
          embed("https://teable.notion-exit.galadrim.fr/framed?u=/base/b")
        )
      )
    ).toBe(true);
  });

  it("ignores an embed that is not a Teable base, such as YouTube", () => {
    expect(
      hasDatabaseEmbed(doc(embed("https://www.youtube.com/watch?v=abc")))
    ).toBe(false);
  });
});

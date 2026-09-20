import type { ProsemirrorData } from "../../types";
import { isDatabasePage, TEABLE_FRAME_REGEX } from "./teable";

const doc = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

const paragraph = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "paragraph",
  content,
});

const text = (value: string): ProsemirrorData => ({
  type: "text",
  text: value,
});

const embed = (href: string): ProsemirrorData => ({
  type: "embed",
  attrs: { href },
});

const base = "https://teable.notion-exit.galadrim.fr/framed?u=/base/b";

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

describe("isDatabasePage", () => {
  it("returns false for a missing or empty document", () => {
    expect(isDatabasePage(undefined)).toBe(false);
    expect(isDatabasePage(null)).toBe(false);
    expect(isDatabasePage(doc(paragraph()))).toBe(false);
    expect(isDatabasePage(doc())).toBe(false);
  });

  it("returns true when the body is nothing but a Teable base embed", () => {
    expect(isDatabasePage(doc(embed(base)))).toBe(true);
  });

  it("ignores the empty paragraph the editor leaves behind", () => {
    expect(isDatabasePage(doc(embed(base), paragraph()))).toBe(true);
    expect(isDatabasePage(doc(paragraph(), embed(base)))).toBe(true);
  });

  it("returns false for a page that merely holds an inline database", () => {
    // galadrim: a Notion page can carry an inline base among its own content
    // (measured: 71 of the 124 documents holding a Teable embed). It stays an
    // ordinary page — its real sub-pages must keep showing up in the
    // "Documents" tab and unfolding in the sidebar.
    expect(isDatabasePage(doc(paragraph(text("Meetings")), embed(base)))).toBe(
      false
    );
    expect(isDatabasePage(doc(embed(base), paragraph(text("See also"))))).toBe(
      false
    );
    expect(
      isDatabasePage(
        doc({ type: "table" }, { type: "blockquote" }, embed(base))
      )
    ).toBe(false);
  });

  it("returns false for a page holding several bases", () => {
    expect(isDatabasePage(doc(embed(base), embed(base + "2")))).toBe(false);
  });

  it("returns false when the embed is nested inside another block", () => {
    expect(isDatabasePage(doc({ type: "container_notice" }))).toBe(false);
    expect(
      isDatabasePage({
        type: "doc",
        content: [{ type: "container_notice", content: [embed(base)] }],
      })
    ).toBe(false);
  });

  it("ignores an embed that is not a Teable base, such as YouTube", () => {
    expect(
      isDatabasePage(doc(embed("https://www.youtube.com/watch?v=abc")))
    ).toBe(false);
  });
});

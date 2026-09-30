import { isDatabasePage } from "./databasePage";

const database = (fullPage: boolean) => ({
  type: "database",
  attrs: { databaseId: "db-1", fullPage },
});

describe("isDatabasePage", () => {
  it("sees a page holding only its full-page database", () => {
    expect(
      isDatabasePage({
        type: "doc",
        content: [{ type: "paragraph" }, database(true), { type: "paragraph" }],
      })
    ).toBe(true);
  });

  it("does not see a page with text or an inline database", () => {
    expect(
      isDatabasePage({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
          database(true),
        ],
      })
    ).toBe(false);
    expect(isDatabasePage({ type: "doc", content: [database(false)] })).toBe(
      false
    );
    expect(isDatabasePage(undefined)).toBe(false);
  });
});

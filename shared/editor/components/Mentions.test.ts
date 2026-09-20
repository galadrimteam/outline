import { documentMentionLabel } from "./Mentions";

describe("documentMentionLabel", () => {
  it("prefers the stored label over the live title", () => {
    // galadrim: our importer writes the author's own sentence text as the
    // label, e.g. "the project is [Add a project to Gatus]" mid-sentence,
    // which is not the title of the page it links to.
    expect(documentMentionLabel("Add a project to Gatus", "Gatus")).toBe(
      "Add a project to Gatus"
    );
  });

  it("falls back to the live title when there is no stored label", () => {
    expect(documentMentionLabel(undefined, "Gatus")).toBe("Gatus");
    expect(documentMentionLabel("", "Gatus")).toBe("Gatus");
  });

  it("returns undefined when neither is available yet", () => {
    expect(documentMentionLabel(undefined, undefined)).toBeUndefined();
  });

  it("is unaffected when the label happens to equal the title", () => {
    expect(documentMentionLabel("Gatus", "Gatus")).toBe("Gatus");
  });
});

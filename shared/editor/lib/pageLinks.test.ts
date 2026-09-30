import { MentionType } from "../../types";
import { schema } from "../../test/editor";
import { isPageLink, pageLinkDecorations } from "./pageLinks";

const mention = (type: MentionType) => ({
  type: "mention",
  attrs: {
    id: "0c440212-8b40-49fa-8a64-2548d6b60d59",
    modelId: "c85a0d80-3a89-4b25-a0cd-e7fc83f0d226",
    type,
    label: "Lexique",
  },
});

const doc = schema.nodeFromJSON({
  type: "doc",
  content: [
    { type: "paragraph", content: [mention(MentionType.Document)] },
    { type: "paragraph", content: [mention(MentionType.Document)] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Voir " }, mention(MentionType.Document)],
    },
    { type: "paragraph", content: [mention(MentionType.User)] },
  ],
});

describe("isPageLink", () => {
  it("is a paragraph holding nothing but a link to a page", () => {
    const blocks: boolean[] = [];
    doc.forEach((node) => blocks.push(isPageLink(node)));
    expect(blocks).toEqual([true, true, false, false]);
  });
});

describe("pageLinkDecorations", () => {
  it("marks every page link of the document", () => {
    const first = doc.child(0).nodeSize;
    const second = doc.child(1).nodeSize;
    expect(
      pageLinkDecorations(doc)
        .find()
        .map((decoration) => [decoration.from, decoration.to])
    ).toEqual([
      [0, first],
      [first, first + second],
    ]);
  });
});

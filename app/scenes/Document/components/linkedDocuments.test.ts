import type { ProsemirrorData } from "@shared/types";
import { getLinkedDocumentKeys, isLinkedDocument } from "./linkedDocuments";

const text = (value: string, href?: string): ProsemirrorData => ({
  type: "text",
  text: value,
  marks: href ? [{ type: "link", attrs: { href } }] : undefined,
});

const paragraph = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "paragraph",
  content,
});

const mention = (type: string, modelId: string): ProsemirrorData => ({
  type: "mention",
  attrs: { type, modelId, label: "Synthetic", id: "mention-id" },
});

const doc = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

describe("getLinkedDocumentKeys", () => {
  it("returns nothing for a missing or empty document", () => {
    expect(getLinkedDocumentKeys(undefined).size).toBe(0);
    expect(getLinkedDocumentKeys(null).size).toBe(0);
    expect(getLinkedDocumentKeys(doc(paragraph())).size).toBe(0);
  });

  it("collects the id of document mentions only", () => {
    const keys = getLinkedDocumentKeys(
      doc(
        paragraph(
          mention("document", "doc-uuid-1"),
          mention("user", "user-uuid"),
          mention("collection", "collection-uuid")
        )
      )
    );

    expect([...keys]).toEqual(["doc-uuid-1"]);
  });

  it("collects the url identifier of relative and absolute document links", () => {
    const keys = getLinkedDocumentKeys(
      doc(
        paragraph(
          text("relative", "/doc/some-title-aBcDeF1234"),
          text("absolute", "https://wiki.example.com/doc/other-ZyXwVu9876#h-x"),
          text("query", "/doc/third-title-Qq11Ww22Ee?q=term"),
          text("bare", "/doc/Rr33Tt44Yy"),
          text("external", "https://example.com/docs/page"),
          text("plain")
        )
      )
    );

    expect([...keys].sort()).toEqual(
      ["Qq11Ww22Ee", "Rr33Tt44Yy", "ZyXwVu9876", "aBcDeF1234"].sort()
    );
  });

  it("looks inside nested blocks such as lists, notices and tables", () => {
    const keys = getLinkedDocumentKeys(
      doc({
        type: "bullet_list",
        content: [
          {
            type: "list_item",
            content: [
              paragraph(mention("document", "doc-uuid-2")),
              {
                type: "container_notice",
                content: [paragraph(text("deep", "/doc/deep-Dd55Ff66Gg"))],
              },
            ],
          },
        ],
      })
    );

    expect(keys.has("doc-uuid-2")).toBe(true);
    expect(keys.has("Dd55Ff66Gg")).toBe(true);
  });
});

describe("isLinkedDocument", () => {
  const keys = getLinkedDocumentKeys(
    doc(
      paragraph(
        mention("document", "doc-uuid-1"),
        text("link", "/doc/old-title-aBcDeF1234")
      )
    )
  );

  it("matches a mentioned document by id", () => {
    expect(isLinkedDocument(keys, { id: "doc-uuid-1", url: "/doc/x-Zz" })).toBe(
      true
    );
  });

  it("matches a linked document by url identifier, even once renamed", () => {
    expect(
      isLinkedDocument(keys, {
        id: "doc-uuid-9",
        url: "/doc/new-title-aBcDeF1234",
      })
    ).toBe(true);
  });

  it("does not match other documents", () => {
    expect(
      isLinkedDocument(keys, { id: "doc-uuid-3", url: "/doc/title-Nn77Mm88" })
    ).toBe(false);
    expect(isLinkedDocument(keys, { id: "doc-uuid-4" })).toBe(false);
  });
});

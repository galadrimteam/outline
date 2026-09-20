import type { JSONNode } from "../../test/editor";
import { findNodes, parser } from "../../test/editor";

const parseToJSON = (markdown: string): JSONNode | undefined =>
  parser.parse(markdown)?.toJSON();

const teable =
  "https://teable.notion-exit.galadrim.fr/framed?u=/base/bse123/tbl456/viw789";
const youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("embeds markdown rule", () => {
  it("converts a link on its own line to an embed", () => {
    const doc = parseToJSON(`before\n\n[${teable}](${teable})\n\nafter`);
    const nodes = findNodes(doc, "embed");

    expect(nodes).toHaveLength(1);
    expect(nodes[0].attrs?.href).toBe(teable);
    expect(findNodes(doc, "paragraph")).toHaveLength(2);
  });

  it("converts consecutive links", () => {
    const doc = parseToJSON(
      `[${teable}](${teable})\n\n[${youtube}](${youtube})`
    );

    expect(findNodes(doc, "embed")).toHaveLength(2);
    expect(findNodes(doc, "paragraph")).toHaveLength(0);
  });

  it("matches teable share links", () => {
    const url = "https://teable.example.com/share/shrABC/view";
    const doc = parseToJSON(`[${url}](${url})`);

    expect(findNodes(doc, "embed")).toHaveLength(1);
  });

  it("does not convert a link with other text in the paragraph", () => {
    const doc = parseToJSON(`see [${teable}](${teable}) for details`);

    expect(findNodes(doc, "embed")).toHaveLength(0);
  });

  it("does not convert a link with a custom label", () => {
    const doc = parseToJSON(`[The database](${teable})`);

    expect(findNodes(doc, "embed")).toHaveLength(0);
  });

  it("converts a url that only matches the generic embed, as Notion does", () => {
    // galadrim: this is the shape our importer and Notion's own export both
    // write for a plain embed block, e.g. a page Notion itself only embeds
    // generically. See matchOnImport in shared/editor/embeds/index.tsx.
    const url = "https://example.com/some/page";
    const doc = parseToJSON(`[${url}](${url})`);

    const nodes = findNodes(doc, "embed");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].attrs?.href).toBe(url);
  });

  it("does not convert links within lists", () => {
    const doc = parseToJSON(`- [${teable}](${teable})`);

    expect(findNodes(doc, "embed")).toHaveLength(0);
  });
});

import type { ProsemirrorData } from "@shared/types";
import {
  convertTeableEmbeds,
  findTeableEmbeds,
  parseTeableHref,
} from "./teableEmbeds";

const framed =
  "https://teable.notion-exit.galadrim.fr/framed?u=/base/bse1/table/tbl1/viw1";
const framedDev =
  "http://teable.notion-exit.localhost/framed?u=/base/bseDev/table/tblDev/viwDev";
const youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const embed = (href: string): ProsemirrorData => ({
  type: "embed",
  attrs: { href, width: null, height: 720 },
});

const paragraph = (text?: string): ProsemirrorData =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };

const heading = (text: string): ProsemirrorData => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});

const doc = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

const ids = () => {
  let next = 0;
  return () => `node-${++next}`;
};

describe("parseTeableHref", () => {
  it("parses the framed wrapper", () => {
    expect(parseTeableHref(framed)).toEqual({
      baseId: "bse1",
      tableId: "tbl1",
      viewId: "viw1",
    });
    expect(parseTeableHref(framedDev)).toEqual({
      baseId: "bseDev",
      tableId: "tblDev",
      viewId: "viwDev",
    });
  });

  it("parses the wrapper without the table segment", () => {
    expect(
      parseTeableHref(
        "https://teable.notion-exit.galadrim.fr/framed?u=/base/bse123/tbl456/viw789"
      )
    ).toEqual({ baseId: "bse123", tableId: "tbl456", viewId: "viw789" });
  });

  it("parses an encoded wrapper", () => {
    expect(
      parseTeableHref(
        "https://teable.example.com/framed?u=%2Fbase%2Fbse1%2Ftable%2Ftbl1%2Fviw1"
      )
    ).toEqual({ baseId: "bse1", tableId: "tbl1", viewId: "viw1" });
  });

  it("parses direct links, with or without a view", () => {
    expect(
      parseTeableHref("https://teable.example.com/base/bse1/table/tbl1/viw1")
    ).toEqual({ baseId: "bse1", tableId: "tbl1", viewId: "viw1" });
    expect(
      parseTeableHref("https://teable.example.com/base/bse1/table/tbl1/")
    ).toEqual({ baseId: "bse1", tableId: "tbl1", viewId: null });
  });

  it("ignores a query string inside the wrapped path", () => {
    expect(
      parseTeableHref(
        "https://teable.example.com/framed?u=/base/bse1/table/tbl1/viw1?recordId=rec1"
      )
    ).toEqual({ baseId: "bse1", tableId: "tbl1", viewId: "viw1" });
  });

  it("rejects share links, other hosts and malformed ids", () => {
    expect(
      parseTeableHref("https://teable.example.com/share/shrABC/view")
    ).toBeNull();
    expect(
      parseTeableHref("https://example.com/framed?u=/base/bse1/table/tbl1/viw1")
    ).toBeNull();
    expect(
      parseTeableHref("https://teable.example.com/framed?u=/base/b/t/v")
    ).toBeNull();
    expect(
      parseTeableHref(
        "https://teable.example.com/framed?u=/base/bse1/table/tbl1/viw1/../x"
      )
    ).toBeNull();
    expect(parseTeableHref("javascript:alert(1)")).toBeNull();
    expect(parseTeableHref("not a url")).toBeNull();
  });
});

describe("findTeableEmbeds", () => {
  it("finds an embed after a paragraph, with the heading before it", () => {
    const embeds = findTeableEmbeds(
      doc(paragraph("Intro"), heading("Roadmap"), paragraph(), embed(framed))
    );

    expect(embeds).toEqual([
      {
        baseId: "bse1",
        tableId: "tbl1",
        viewId: "viw1",
        href: framed,
        fullPage: false,
        heading: "Roadmap",
      },
    ]);
  });

  it("sees an embed alone in the page as a full-page database", () => {
    const embeds = findTeableEmbeds(doc(paragraph(), embed(framed)));

    expect(embeds).toHaveLength(1);
    expect(embeds[0].fullPage).toBe(true);
    expect(embeds[0].heading).toBeNull();
  });

  it("finds nested embeds and ignores other embeds", () => {
    const embeds = findTeableEmbeds(
      doc(
        embed(youtube),
        {
          type: "container_toggle",
          content: [paragraph("Details"), embed(framedDev)],
        },
        {
          type: "table",
          content: [
            {
              type: "tr",
              content: [{ type: "td", content: [embed(framed)] }],
            },
          ],
        }
      )
    );

    expect(embeds.map((e) => e.tableId)).toEqual(["tblDev", "tbl1"]);
    expect(embeds.every((e) => !e.fullPage)).toBe(true);
  });

  it("does not see an embed in a toggle as a full-page database", () => {
    const embeds = findTeableEmbeds(
      doc({
        type: "container_toggle",
        content: [paragraph(), embed(framed)],
      })
    );

    expect(embeds[0].fullPage).toBe(false);
  });
});

describe("convertTeableEmbeds", () => {
  it("replaces an inline embed with a database node on its view", () => {
    const input = doc(paragraph("Intro"), embed(framed), paragraph("After"));

    const { doc: output, converted } = convertTeableEmbeds(
      input,
      () => ({ databaseId: "db-1", title: "Roadmap" }),
      ids()
    );

    expect(converted).toBe(1);
    expect(output).toEqual(
      doc(
        paragraph("Intro"),
        {
          type: "database",
          attrs: {
            id: "node-1",
            databaseId: "db-1",
            viewIds: ["viw1"],
            fullPage: false,
            legacyHref: framed,
            title: "Roadmap",
          },
        },
        paragraph("After")
      )
    );
    expect(input.content?.[1].type).toBe("embed");
  });

  it("makes the only embed of a page a full-page database with every view", () => {
    const { doc: output, converted } = convertTeableEmbeds(
      doc(paragraph(), embed(framed)),
      () => ({ databaseId: "db-1" }),
      ids()
    );

    expect(converted).toBe(1);
    expect(output.content?.[1]).toEqual({
      type: "database",
      attrs: {
        id: "node-1",
        databaseId: "db-1",
        viewIds: null,
        fullPage: true,
        legacyHref: framed,
        title: null,
      },
    });
  });

  it("converts nested embeds and leaves the others untouched", () => {
    const toggle: ProsemirrorData = {
      type: "container_toggle",
      content: [paragraph("Details"), embed(framedDev)],
    };
    const untouched = { type: "blockquote", content: [paragraph("Quote")] };
    const input = doc(embed(youtube), toggle, untouched, embed(framed));

    const { doc: output, converted } = convertTeableEmbeds(
      input,
      (e) => (e.tableId === "tblDev" ? { databaseId: "db-dev" } : null),
      ids()
    );

    expect(converted).toBe(1);
    expect(output.content?.[0]).toBe(input.content?.[0]);
    expect(output.content?.[1].content?.[1]).toMatchObject({
      type: "database",
      attrs: { databaseId: "db-dev", viewIds: ["viwDev"], fullPage: false },
    });
    expect(output.content?.[2]).toBe(untouched);
    expect(output.content?.[3]).toBe(input.content?.[3]);
  });

  it("converts a bare link to a Teable view inside a toggle, not a link inside text", () => {
    const link = (href: string, text = href): ProsemirrorData => ({
      type: "paragraph",
      content: [
        { type: "text", text, marks: [{ type: "link", attrs: { href } }] },
      ],
    });
    const inText: ProsemirrorData = {
      type: "paragraph",
      content: [
        { type: "text", text: "See " },
        {
          type: "text",
          text: "the board",
          marks: [{ type: "link", attrs: { href: framed } }],
        },
      ],
    };
    const toggle: ProsemirrorData = {
      type: "container_toggle",
      content: [paragraph("Gantt"), link(framedDev)],
    };
    const input = doc(toggle, inText, link(youtube));

    const { doc: output, converted } = convertTeableEmbeds(
      input,
      (e) => ({ databaseId: `db-${e.tableId}` }),
      ids()
    );

    expect(converted).toBe(1);
    expect(output.content?.[0].content?.[1]).toMatchObject({
      type: "database",
      attrs: {
        databaseId: "db-tblDev",
        viewIds: ["viwDev"],
        legacyHref: framedDev,
      },
    });
    expect(output.content?.[1]).toBe(inText);
    expect(output.content?.[2]).toBe(input.content?.[2]);
  });

  it("returns the document itself when nothing resolves", () => {
    const input = doc(paragraph("Intro"), embed(framed));

    const result = convertTeableEmbeds(input, () => null);

    expect(result.converted).toBe(0);
    expect(result.doc).toBe(input);
  });

  it("changes nothing on a converted document", () => {
    const first = convertTeableEmbeds(
      doc(embed(framed), paragraph("After")),
      () => ({ databaseId: "db-1" })
    );
    const second = convertTeableEmbeds(first.doc, () => ({
      databaseId: "db-1",
    }));

    expect(second.converted).toBe(0);
    expect(second.doc).toBe(first.doc);
  });
});

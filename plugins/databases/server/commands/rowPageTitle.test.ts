import type { ProsemirrorData } from "@shared/types";
import { mayHoldTitleLines, withoutRepeatedTitle } from "./rowPageTitle";

const text = (value: string, marks: string[] = []): ProsemirrorData => ({
  type: "text",
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "paragraph",
  content,
});
const bold = (value: string) => paragraph(text(value, ["strong"]));
const plain = (value: string) => paragraph(...(value ? [text(value)] : []));
const table: ProsemirrorData = { type: "table", content: [] };
const page = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

const whole =
  "ETQJU, dans un document, je peux mentionner un autre document par nom ou référence et afficher ce document sur le côté";
const cut =
  "ETQJU, dans un document, je peux mentionner un autre document par nom ou référence et afficher ce…";

describe("withoutRepeatedTitle", () => {
  it("gives a cut title back whole and drops its bold repeat", () => {
    expect(
      withoutRepeatedTitle(
        {
          title: cut,
          content: page(plain(""), bold(whole), table, plain("Le corps")),
        },
        whole
      )
    ).toEqual({
      title: whole,
      content: page(plain(""), table, plain("Le corps")),
    });
  });

  it("joins the lines of a title of several lines", () => {
    expect(
      withoutRepeatedTitle(
        {
          title: "Dans gestion des contrôles :",
          content: page(
            plain("Mettre le thème avant le matériel contrôlé"),
            table
          ),
        },
        "Dans gestion des contrôles : Mettre le thème avant le matériel contrôlé"
      )
    ).toEqual({
      title:
        "Dans gestion des contrôles : Mettre le thème avant le matériel contrôlé",
      content: page(table),
    });
  });

  it("takes the bold repeat of a cut first line and the lines after it", () => {
    const first = `${whole}, encore`;
    const rowTitle = `${first} Dans les stats : la suite`;
    expect(
      withoutRepeatedTitle(
        {
          title: cut,
          content: page(bold(first), plain("Dans les stats : la suite"), table),
        },
        rowTitle
      )
    ).toEqual({ title: rowTitle, content: page(table) });
  });

  it("reads a repeat whose link and asterisks the migration rewrote", () => {
    const rowTitle = `${whole} https://example.com/a*b`;
    expect(
      withoutRepeatedTitle(
        {
          title: `${whole.slice(0, 60)} <https://example.com/a…`,
          content: page(
            paragraph(
              text(`${whole} `, ["strong"]),
              text("https://example.com/ab", ["strong", "link"])
            )
          ),
        },
        rowTitle
      )
    ).toEqual({ title: rowTitle, content: page() });
  });

  it("leaves a page alone when the paragraphs do not make the row's title", () => {
    expect(
      withoutRepeatedTitle(
        { title: cut, content: page(bold("Autre chose"), table) },
        whole
      )
    ).toBeNull();
    expect(
      withoutRepeatedTitle(
        {
          title: "Dans gestion des contrôles :",
          content: page(plain("Une première ligne de corps"), table),
        },
        "Dans gestion des contrôles : Mettre le thème"
      )
    ).toBeNull();
  });

  it("leaves a page alone whose title already is the row's", () => {
    expect(
      withoutRepeatedTitle(
        { title: whole, content: page(bold(whole), table) },
        whole
      )
    ).toBeNull();
  });

  it("only reads the paragraphs right under the title", () => {
    expect(
      withoutRepeatedTitle(
        { title: cut, content: page(table, bold(whole)) },
        whole
      )
    ).toBeNull();
  });

  it("keeps a page whose whole title would not fit", () => {
    const long = "x".repeat(1001);
    expect(
      withoutRepeatedTitle(
        { title: `${"x".repeat(97)}…`, content: page(bold(long)) },
        long
      )
    ).toBeNull();
  });
});

describe("mayHoldTitleLines", () => {
  it("is true when text comes first under the title", () => {
    expect(mayHoldTitleLines(page(plain(""), bold(whole), table))).toBe(true);
    expect(mayHoldTitleLines(page(plain(""), table))).toBe(false);
    expect(mayHoldTitleLines(page())).toBe(false);
  });
});

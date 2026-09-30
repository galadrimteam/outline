import type { ProsemirrorData } from "@shared/types";
import { withoutPropertyTable } from "./rowPropertyTables";

const text = (value: string): ProsemirrorData => ({
  type: "text",
  text: value,
});
const cell = (type: "th" | "td", value: string): ProsemirrorData => ({
  type,
  content: [{ type: "paragraph", content: value ? [text(value)] : [] }],
});
const table = (rows: string[][]): ProsemirrorData => ({
  type: "table",
  content: rows.map((row, index) => ({
    type: "tr",
    content: row.map((value) => cell(index === 0 ? "th" : "td", value)),
  })),
});
const paragraph = (value: string): ProsemirrorData => ({
  type: "paragraph",
  content: value ? [text(value)] : [],
});
const page = (...content: ProsemirrorData[]): ProsemirrorData => ({
  type: "doc",
  content,
});

describe("withoutPropertyTable", () => {
  const fields = ["Statut", "Dev", "Estimation"];

  it("removes the table of properties under the title", () => {
    const content = page(
      paragraph(""),
      table([
        ["Propriété", "Valeur"],
        ["Statut", "En cours"],
        ["dev", "Ada"],
      ]),
      paragraph("Le corps")
    );
    expect(withoutPropertyTable(content, fields)).toEqual(
      page(paragraph(""), paragraph("Le corps"))
    );
  });

  it("keeps a table naming something that is not a field", () => {
    const content = page(
      table([
        ["Propriété", "Valeur"],
        ["Statut", "En cours"],
        ["Budget", "3"],
      ])
    );
    expect(withoutPropertyTable(content, fields)).toBeNull();
  });

  it("keeps any other table, and a table that is not at the top", () => {
    expect(
      withoutPropertyTable(
        page(
          table([
            ["A", "B"],
            ["Statut", "x"],
          ])
        ),
        fields
      )
    ).toBeNull();
    expect(
      withoutPropertyTable(
        page(
          paragraph("Intro"),
          table([
            ["Propriété", "Valeur"],
            ["Statut", "x"],
          ])
        ),
        fields
      )
    ).toBeNull();
  });
});

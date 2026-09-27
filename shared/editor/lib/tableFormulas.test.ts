import {
  createEditorState,
  findNodes,
  parser,
  serializer,
} from "../../test/editor";
import {
  headerFormulaMarkdown,
  recomputeFormulas,
  splitHeaderFormula,
} from "./tableFormulas";

const NOW = () => new Date(2026, 8, 27, 10, 30);

const markdown = `| Client | Jours | TJM | Montant {=prop("Jours") * prop("TJM")} | Gros {=prop("Montant") > 5000 \\|\\| prop("Client") == "Acme"} |
|---|---|---|---|---|
| Acme | 2 | 600 | | |
| Beta | 10 | 650 | 1 | |
`;

/** The text of every cell, row by row. */
function cells(doc: ReturnType<typeof parser.parse>): string[][] {
  return findNodes(doc!.toJSON(), "tr").map((row) =>
    (row.content ?? []).map((cell) =>
      findNodes(cell, "text")
        .map((text) => text.text)
        .join("")
    )
  );
}

describe("splitHeaderFormula", () => {
  it("reads the formula after the header's text", () => {
    expect(splitHeaderFormula('Total {=prop("A") * 2}')).toEqual({
      text: "Total",
      formula: 'prop("A") * 2',
    });
    expect(splitHeaderFormula("Total")).toEqual({
      text: "Total",
      formula: null,
    });
    expect(splitHeaderFormula("{=}")).toEqual({ text: "{=}", formula: null });
  });

  it("reads back what headerFormulaMarkdown writes", () => {
    const formula = 'prop("a") || prop("b")';
    expect(splitHeaderFormula("X" + headerFormulaMarkdown(formula))).toEqual({
      text: "X",
      formula,
    });
  });
});

describe("formula columns", () => {
  it("parse from Markdown into the header's formula attribute", () => {
    const doc = parser.parse(markdown);
    const headers = findNodes(doc!.toJSON(), "th");
    expect(headers.map((th) => th.attrs?.formula)).toEqual([
      null,
      null,
      null,
      'prop("Jours") * prop("TJM")',
      'prop("Montant") > 5000 || prop("Client") == "Acme"',
    ]);
    expect(cells(doc)[0]).toEqual([
      "Client",
      "Jours",
      "TJM",
      "Montant",
      "Gros",
    ]);
  });

  it("survive a round trip through Markdown", () => {
    const doc = parser.parse(markdown);
    const again = parser.parse(serializer.serialize(doc!));
    expect(again!.toJSON()).toEqual(doc!.toJSON());
  });

  it("are left out of standard Markdown", () => {
    const doc = parser.parse(markdown);
    const out = serializer.serialize(doc!, { commonMark: true });
    expect(out).not.toContain("{=");
  });

  it("compute every row, a formula reading another formula column included", () => {
    const state = createEditorState(parser.parse(markdown)!);
    const tr = recomputeFormulas(state, NOW);
    expect(tr).not.toBeNull();
    expect(cells(tr!.doc).slice(1)).toEqual([
      ["Acme", "2", "600", "1200", "☑"],
      ["Beta", "10", "650", "6500", "☑"],
    ]);
  });

  it("leave the document alone once computed", () => {
    const state = createEditorState(parser.parse(markdown)!);
    const computed = state.apply(recomputeFormulas(state, NOW)!);
    expect(recomputeFormulas(computed, NOW)).toBeNull();
  });

  it("show what went wrong instead of a value", () => {
    const doc = parser.parse(`| A | B {=prop("Z")} |
|---|---|
| 1 | |
`);
    const tr = recomputeFormulas(createEditorState(doc!), NOW);
    expect(cells(tr!.doc)[1][1]).toBe("⚠ Colonne inconnue : Z");
  });

  it("read check boxes as true or false", () => {
    const doc =
      parser.parse(`| Fait | Statut {=if(prop("Fait"), "fini", "en cours")} |
|---|---|
| [x] oui | |
| [ ] non | |
`);
    const tr = recomputeFormulas(createEditorState(doc!), NOW);
    expect(
      cells(tr!.doc)
        .slice(1)
        .map((row) => row[1])
    ).toEqual(["fini", "en cours"]);
  });
});

import {
  computeCell,
  evaluate,
  formatDate,
  formatValue,
  FormulaError,
  parseFormula,
  readCell,
} from "./formula";

const NOW = () => new Date(2026, 8, 27, 10, 30);

const row = (cells: Record<string, string>) => (name: string) =>
  readCell(cells[name] ?? "");

describe("readCell", () => {
  it("reads numbers, French ones included", () => {
    expect(readCell("1200")).toBe(1200);
    expect(readCell("1 200,50")).toBe(1200.5);
    expect(readCell("-3.5")).toBe(-3.5);
    expect(readCell("12 %")).toBeCloseTo(0.12);
  });

  it("reads dates as Notion's export and our tables write them", () => {
    expect(readCell("27 septembre 2026")).toEqual(new Date(2026, 8, 27));
    expect(readCell("1er mars 2025")).toEqual(new Date(2025, 2, 1));
    expect(readCell("September 27, 2026")).toEqual(new Date(2026, 8, 27));
    expect(readCell("27/09/2026")).toEqual(new Date(2026, 8, 27));
    expect(readCell("2026-09-27")).toEqual(new Date(2026, 8, 27));
  });

  it("reads check boxes, empty cells and text", () => {
    expect(readCell("☑")).toBe(true);
    expect(readCell("☐")).toBe(false);
    expect(readCell("  ")).toBeNull();
    expect(readCell("Acme")).toBe("Acme");
  });
});

describe("evaluate", () => {
  it("does arithmetic with the usual precedence", () => {
    expect(evaluate("1 + 2 * 3", row({}))).toBe(7);
    expect(evaluate("(1 + 2) * 3", row({}))).toBe(9);
    expect(evaluate("2 ^ 3 ^ 2", row({}))).toBe(512);
    expect(evaluate("-2 ^ 2", row({}))).toBe(-4);
    expect(evaluate("10 % 4", row({}))).toBe(2);
  });

  it("reads other columns of the same row", () => {
    const r = row({ Prix: "12,5", Quantité: "4" });
    expect(evaluate('prop("Prix") * prop("Quantité")', r)).toBe(50);
  });

  it("treats an empty cell as 0 in arithmetic and as empty in text", () => {
    const r = row({ A: "", B: "3" });
    expect(evaluate('prop("A") + prop("B")', r)).toBe(3);
    expect(evaluate('concat("x", prop("A"))', r)).toBe("x");
  });

  it("the shape most of Galadrim's formulas have: toNumber of a column", () => {
    const r = row({ "Jours vendus": "12", TJM: "650" });
    expect(
      evaluate('toNumber(prop("Jours vendus")) * toNumber(prop("TJM"))', r)
    ).toBe(7800);
  });

  it("comparisons, if, and/or, the ternary", () => {
    const r = row({ Montant: "1500", Signé: "☑" });
    expect(evaluate('if(prop("Montant") > 1000, "gros", "petit")', r)).toBe(
      "gros"
    );
    expect(evaluate('prop("Montant") >= 1500 and prop("Signé")', r)).toBe(true);
    expect(evaluate('prop("Montant") < 10 || not prop("Signé")', r)).toBe(
      false
    );
    expect(evaluate('prop("Montant") == 1500 ? "oui" : "non"', r)).toBe("oui");
    expect(evaluate('prop("Montant") != 1500 ? "oui" : "non"', r)).toBe("non");
  });

  it("only computes the branch that is taken", () => {
    expect(
      evaluate('if(true, 1, prop("Absente"))', () => {
        throw new FormulaError("never read");
      })
    ).toBe(1);
  });

  it("Notion's function names for operators", () => {
    const r = row({ a: "8", b: "2" });
    expect(evaluate('add(prop("a"), prop("b"))', r)).toBe(10);
    expect(
      evaluate(
        'divide(multiply(prop("a"), 3), subtract(prop("a"), prop("b")))',
        r
      )
    ).toBe(4);
    expect(evaluate('unaryMinus(prop("b"))', r)).toBe(-2);
    expect(evaluate('largerEq(prop("a"), 8)', r)).toBe(true);
  });

  it("rounding", () => {
    expect(evaluate("ceil(2.1)", row({}))).toBe(3);
    expect(evaluate("floor(2.9)", row({}))).toBe(2);
    expect(evaluate("round(2.456, 2)", row({}))).toBe(2.46);
  });

  it("dates: dateBetween, dateAdd, formatDate, method calls", () => {
    const r = row({ Début: "1 septembre 2026", Fin: "27 septembre 2026" });
    expect(evaluate('dateBetween(prop("Fin"), prop("Début"), "days")', r)).toBe(
      26
    );
    expect(
      evaluate('dateBetween(prop("Fin"), prop("Début"), "weeks")', r)
    ).toBe(3);
    expect(evaluate('prop("Début").formatDate("DD/MM/YYYY")', r)).toBe(
      "01/09/2026"
    );
    expect(
      evaluate(
        'formatDate(dateAdd(prop("Début"), 1, "months"), "D MMMM YYYY")',
        r
      )
    ).toBe("1 octobre 2026");
    expect(evaluate('dateBetween(now(), prop("Début"), "days")', r, NOW)).toBe(
      26
    );
  });

  it("text functions", () => {
    const r = row({ Nom: "Acme" });
    expect(evaluate('concat(prop("Nom"), " — ", "client")', r)).toBe(
      "Acme — client"
    );
    expect(evaluate('prop("Nom") + " SA"', r)).toBe("Acme SA");
    expect(evaluate('length(prop("Nom"))', r)).toBe(4);
    expect(evaluate('contains(prop("Nom"), "cm")', r)).toBe(true);
    expect(evaluate('prop("Nom").upper()', r)).toBe("ACME");
  });

  it("reports what it cannot read", () => {
    expect(() => parseFormula("1 +")).toThrow(FormulaError);
    expect(() => parseFormula('prop("A"')).toThrow(FormulaError);
    expect(() => evaluate("inconnue(1)", row({}))).toThrow(/Fonction inconnue/);
    expect(() => evaluate("1 / 0", row({}))).toThrow(/Division par zéro/);
  });
});

describe("computeCell", () => {
  it("shows the result, or a warning instead of breaking the table", () => {
    expect(computeCell('prop("a") * 2', { a: "21" })).toBe("42");
    expect(computeCell('prop("b")', { a: "1" })).toBe("⚠ Colonne inconnue : b");
    expect(computeCell("1 +", {})).toMatch(/^⚠/);
  });

  it("writes results the way a Notion user expects them", () => {
    expect(computeCell("0.1 + 0.2", {})).toBe("0.3");
    expect(computeCell('prop("x") > 1', { x: "2" })).toBe("☑");
    expect(
      computeCell('dateAdd(prop("d"), 2, "days")', { d: "27 septembre 2026" })
    ).toBe("29 septembre 2026");
  });
});

describe("formatDate / formatValue", () => {
  it("formats with moment's patterns, in French", () => {
    const d = new Date(2026, 0, 5, 9, 7);
    expect(formatDate(d, "dddd D MMMM YYYY [à] HH:mm")).toBe(
      "lundi 5 janvier 2026 à 09:07"
    );
    expect(formatValue(null)).toBe("");
    expect(formatValue(false)).toBe("☐");
  });
});

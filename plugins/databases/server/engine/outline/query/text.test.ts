import { DatabaseFieldType } from "@shared/databases/types";
import { PARIS, makeField } from "./testFixtures";
import { cellText, formatNumber, searchKey } from "./text";

describe("cellText", () => {
  it("writes numbers with the field's precision, percent or currency", () => {
    const field = (formatting = {}) =>
      makeField({
        id: "n",
        type: DatabaseFieldType.Number,
        options: { formatting },
      });
    expect(cellText(3.456, field({ type: "decimal", precision: 2 }))).toBe(
      "3.46"
    );
    expect(cellText(0.256, field({ type: "percent", precision: 1 }))).toBe(
      "25.6%"
    );
    expect(
      cellText(-1234.5, field({ type: "currency", symbol: "€", precision: 0 }))
    ).toBe("-€1,235");
    expect(cellText(3.456, field())).toBe("3.456");
    expect(formatNumber(Number.NaN)).toBe("");
  });

  it("writes dates in the field's format, zone and French month names", () => {
    const field = makeField({
      id: "d",
      type: DatabaseFieldType.Date,
      options: {
        formatting: { date: "D MMMM YYYY", time: "HH:mm", timeZone: PARIS },
      },
    });
    expect(cellText("2025-07-01T07:05:00.000Z", field)).toBe(
      "1 juillet 2025 09:05"
    );
    const plain = makeField({ id: "p", type: DatabaseFieldType.Date });
    expect(cellText("2025-07-01T07:05:00.000Z", plain)).toBe("2025-07-01");
  });

  it("writes people, links and attachments by name, lists joined", () => {
    const users = makeField({ id: "u", type: DatabaseFieldType.User });
    expect(
      cellText(
        [
          { id: "u1", title: "Ada" },
          { id: "u2", title: "Bob" },
        ],
        users
      )
    ).toBe("Ada, Bob");
    const files = makeField({ id: "f", type: DatabaseFieldType.Attachment });
    expect(
      cellText(
        [{ id: "a", name: "spec.pdf", mimetype: "application/pdf", size: 1 }],
        files
      )
    ).toBe("spec.pdf");
    const tags = makeField({ id: "t", type: DatabaseFieldType.MultipleSelect });
    expect(cellText(["a", "b, c"], tags)).toBe('a, "b, c"');
  });

  it("writes checkboxes as true or nothing, empties as nothing", () => {
    const check = makeField({ id: "c", type: DatabaseFieldType.Checkbox });
    expect(cellText(true, check)).toBe("true");
    expect(cellText(null, check)).toBe("");
    expect(
      cellText(
        [],
        makeField({ id: "t", type: DatabaseFieldType.MultipleSelect })
      )
    ).toBe("");
  });
});

describe("searchKey", () => {
  it("folds case and accents", () => {
    expect(searchKey("Élan À Noël")).toBe("elan a noel");
  });
});

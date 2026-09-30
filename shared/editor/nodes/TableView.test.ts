import { schema } from "../../test/editor";
import { hasColumnWidths } from "./TableView";

function table(colwidths: (number[] | null)[]) {
  return schema.nodeFromJSON({
    type: "table",
    content: [
      {
        type: "tr",
        content: colwidths.map((colwidth) => ({
          type: "td",
          attrs: { colwidth },
          content: [{ type: "paragraph" }],
        })),
      },
    ],
  });
}

describe("hasColumnWidths", () => {
  it("is false for a table imported without widths, which then fits its content", () => {
    expect(hasColumnWidths(table([null, null]))).toBe(false);
  });

  it("is true once a column has a width", () => {
    expect(hasColumnWidths(table([[180], null]))).toBe(true);
  });
});

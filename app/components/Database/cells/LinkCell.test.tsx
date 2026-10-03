import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { DatabaseField } from "@shared/databases/types";
import type Database from "~/models/Database";
import { linkCell, linkedRecordPath } from "./LinkCell";

const relation = (options: DatabaseField["options"]) =>
  ({ id: "fldEpic", name: "Epic", type: "link", options }) as DatabaseField;

describe("linkedRecordPath", () => {
  it("opens a linked row in the database of its own table", () => {
    expect(
      linkedRecordPath(relation({ foreignDatabaseId: "db-gantt" }), "rec1")
    ).toBe("/db/db-gantt/row/rec1");
  });

  it("has no page to open when the linked table has no Outline database", () => {
    expect(linkedRecordPath(relation({}), "rec1")).toBeNull();
  });
});

describe("linkCell renderer", () => {
  const links = Array.from({ length: 8 }, (_, index) => ({
    id: `rec${index}`,
    title: `Row ${index}`,
  }));

  function render(variant: "table" | "property" | "card"): string {
    return renderToString(
      <MemoryRouter>
        <linkCell.Renderer
          field={relation({ foreignDatabaseId: "db-gantt" })}
          value={links}
          database={{} as Database}
          variant={variant}
        />
      </MemoryRouter>
    );
  }

  it("lists five linked rows on a page, then how many more, as Notion does", () => {
    const html = render("property");
    expect(html).toContain("Row 4");
    expect(html).not.toContain("Row 5");
    expect(html).toContain("3 more…");
  });

  it("shows every linked row in a table cell", () => {
    const html = render("table");
    expect(html).toContain("Row 7");
    expect(html).not.toContain("more…");
  });

  it("leaves the click on a card's relation to its editor, as Notion opens the picker", () => {
    expect(render("table")).toContain('href="/db/db-gantt/row/rec0"');
    expect(render("card")).not.toContain("href=");
    expect(render("card")).toContain("Row 7");
  });
});

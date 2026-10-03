import { notionDatabaseName } from "./tableNames";

describe("notionDatabaseName", () => {
  it("leaves out the suffix the migration gives to a name taken twice", () => {
    expect(notionDatabaseName("Delisle Suivi Kanban (2)")).toBe(
      "Delisle Suivi Kanban"
    );
    expect(notionDatabaseName("Points (12)")).toBe("Points");
  });

  it("keeps Notion's own « (1) » and other parentheses", () => {
    expect(notionDatabaseName("Calendrier Prévisionnel (1)")).toBe(
      "Calendrier Prévisionnel (1)"
    );
    expect(notionDatabaseName("Suivi (kanban et roadmap)")).toBe(
      "Suivi (kanban et roadmap)"
    );
  });

  it("is null for a table without a name", () => {
    expect(notionDatabaseName("")).toBeNull();
    expect(notionDatabaseName(null)).toBeNull();
  });
});

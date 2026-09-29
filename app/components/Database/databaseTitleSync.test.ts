import { titleSync } from "./databaseTitleSync";

describe("titleSync", () => {
  it("renames a full-page database after its page", () => {
    expect(
      titleSync({
        fullPage: true,
        pageTitle: " QA Pleine page ",
        databaseTitle: "Sans titre",
        nodeTitle: "Sans titre",
      })
    ).toEqual({ rename: "QA Pleine page" });
  });

  it("leaves a full-page database alone while its page has no title", () => {
    expect(
      titleSync({
        fullPage: true,
        pageTitle: "",
        databaseTitle: "Sans titre",
        nodeTitle: "Sans titre",
      })
    ).toEqual({});
  });

  it("never renames an inline database after its page", () => {
    expect(
      titleSync({
        fullPage: false,
        pageTitle: "Projet",
        databaseTitle: "Tickets",
        nodeTitle: "Tickets",
      })
    ).toEqual({});
  });

  it("writes the database title into an out of date node", () => {
    expect(
      titleSync({
        fullPage: false,
        pageTitle: "Projet",
        databaseTitle: "QA Tâches",
        nodeTitle: "Sans titre",
      })
    ).toEqual({ nodeTitle: "QA Tâches" });
    expect(
      titleSync({
        fullPage: false,
        pageTitle: undefined,
        databaseTitle: "",
        nodeTitle: "Old",
      })
    ).toEqual({ nodeTitle: null });
  });

  it("cuts a long page title to the database limit", () => {
    const long = "x".repeat(300);
    expect(
      titleSync({
        fullPage: true,
        pageTitle: long,
        databaseTitle: "x".repeat(255),
        nodeTitle: "x".repeat(255),
      })
    ).toEqual({});
  });
});

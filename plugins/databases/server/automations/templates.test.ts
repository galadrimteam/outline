import { renderTemplate } from "./templates";

const variables = {
  title: "Fix login",
  url: "https://outline.test/db/1/row/rec1",
  database: "Delisle",
  actor: "Hugo",
  property: (name: string) =>
    name.toLowerCase() === "statut" ? "En Développement" : undefined,
};

describe("renderTemplate", () => {
  it("replaces the row's variables and its properties by name", () => {
    expect(
      renderTemplate(
        "{{actor}} moved « {{ title }} » to {{property:Statut}} in {{database}}: {{url}}",
        variables
      )
    ).toEqual(
      "Hugo moved « Fix login » to En Développement in Delisle: https://outline.test/db/1/row/rec1"
    );
  });

  it("empties unknown properties and keeps unknown variables", () => {
    expect(renderTemplate("{{property:Nope}}|{{nope}}", variables)).toEqual(
      "|{{nope}}"
    );
  });
});

import { Provider } from "mobx-react";
import type * as React from "react";
import { renderToString } from "react-dom/server";
import { ThemeProvider } from "styled-components";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import type Database from "~/models/Database";
import stores from "~/stores";
import { computedCell } from "./ComputedCell";
import { PeopleChips, peopleOf } from "./UserCell";

const people = [
  {
    id: "email:malo@example.com",
    email: "malo@example.com",
    title: "Malo Durand",
    outlineUserId: null,
  },
  {
    id: "email:jb@example.com",
    email: "jb@example.com",
    title: "Jean-Baptiste Hammann",
    outlineUserId: null,
  },
];

const devRollup = {
  id: "fldDev",
  name: "Dev",
  type: DatabaseFieldType.Rollup,
  options: { expression: "array_unique({values})" },
  isPrimary: false,
  isComputed: true,
  isLookup: false,
  cellValueType: "string",
  isMultipleCellValue: true,
} as DatabaseField;

function render(element: React.ReactElement): string {
  return renderToString(
    <Provider rootStore={stores}>
      <ThemeProvider theme={light}>{element}</ThemeProvider>
    </Provider>
  );
}

describe("peopleOf", () => {
  it("reads the people of a rollup of a person property", () => {
    expect(peopleOf(people)).toEqual(people);
  });

  it("finds no people in linked rows or in text", () => {
    expect(peopleOf([{ id: "rec1", title: "QCM" }])).toEqual([]);
    expect(peopleOf(["Malo Durand"])).toEqual([]);
    expect(peopleOf(null)).toEqual([]);
  });
});

describe("people in computed values", () => {
  it("draws a rollup of people with an avatar and a name each, as a person property", () => {
    const html = render(
      <computedCell.Renderer
        field={devRollup}
        value={people}
        database={{} as Database}
        variant="property"
      />
    );
    expect(html).toContain("Malo Durand");
    expect(html).toContain("Jean-Baptiste Hammann");
    expect(html).not.toContain("Malo Durand, Jean-Baptiste Hammann");
  });

  it("draws the avatars alone where Notion does, as on a timeline bar", () => {
    const html = render(
      <PeopleChips people={people} variant="table" avatarsOnly />
    );
    expect(html).not.toContain("Malo Durand<");
    expect(html).toContain('aria-label="Malo Durand"');
    expect(html).toContain('aria-label="Jean-Baptiste Hammann"');
  });
});

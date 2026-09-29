import { FILTER_ME } from "@shared/databases/filters";
import type {
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseRecord,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import {
  candidateKind,
  fieldValues,
  linkOptions,
  peopleOptions,
} from "./filterCandidates";

const owner: DatabaseField = {
  id: "owner",
  name: "Responsable",
  type: DatabaseFieldType.User,
  options: {},
  isPrimary: false,
  isComputed: false,
  isLookup: false,
  cellValueType: "string",
  isMultipleCellValue: true,
};

const ada = { id: "usrAda", title: "Ada", outlineUserId: "u-ada" };
const bob = { id: "usrBob", title: "Bob", outlineUserId: "u-bob" };
const guest = { id: "email:guest@x.fr", title: "Guest" };

describe("candidateKind", () => {
  it("picks selects, people and relations, and types the rest", () => {
    expect(candidateKind(owner)).toBe("person");
    expect(candidateKind({ ...owner, type: DatabaseFieldType.CreatedBy })).toBe(
      "person"
    );
    expect(candidateKind({ ...owner, type: DatabaseFieldType.Link })).toBe(
      "link"
    );
    expect(
      candidateKind({ ...owner, type: DatabaseFieldType.MultipleSelect })
    ).toBe("choice");
    expect(
      candidateKind({ ...owner, type: DatabaseFieldType.SingleLineText })
    ).toBeUndefined();
  });
});

describe("fieldValues", () => {
  it("reads loaded rows and the group headers of every row", () => {
    const records: DatabaseRecord[] = [
      { id: "rec1", fields: { owner: [ada] } },
    ];
    const points: DatabaseGroupPoint[] = [
      { type: "header", id: "g1", depth: 0, value: [bob], isCollapsed: false },
      { type: "row", count: 3 },
    ];
    expect(fieldValues(owner, records, points)).toEqual([[ada], [bob]]);
  });
});

describe("peopleOptions", () => {
  it("offers « Me », the people of the rows and the other members", () => {
    const options = peopleOptions(
      [[bob, ada], [guest], null],
      [
        { id: "u-ada", name: "Ada Lovelace", avatarUrl: null },
        { id: "u-cy", name: "Cyrille", avatarUrl: "https://a/cy.png" },
      ],
      "Me"
    );
    expect(options.map((option) => [option.value, option.label])).toEqual([
      [FILTER_ME, "Me"],
      ["usrAda", "Ada"],
      ["usrBob", "Bob"],
      ["u-cy", "Cyrille"],
      ["email:guest@x.fr", "Guest"],
    ]);
    expect(options[3].cell).toEqual({
      id: "u-cy",
      title: "Cyrille",
      avatarUrl: "https://a/cy.png",
      outlineUserId: "u-cy",
    });
  });

  it("offers the members even when no row is loaded, as on a board", () => {
    expect(
      peopleOptions([], [{ id: "u-ada", name: "Ada", avatarUrl: null }], "Moi")
    ).toEqual([
      { value: FILTER_ME, label: "Moi" },
      expect.objectContaining({ value: "u-ada", label: "Ada" }),
    ]);
  });
});

describe("linkOptions", () => {
  it("merges the linked rows of the rows with the linked table's rows", () => {
    const options = linkOptions(
      [[{ id: "rec2", title: "Zèbre" }], null],
      [
        { id: "rec1", title: "Alpha" },
        { id: "rec2", title: "Zèbre" },
        { id: "rec3", title: "" },
      ]
    );
    expect(options.map((option) => [option.value, option.label])).toEqual([
      ["rec1", "Alpha"],
      ["rec3", "rec3"],
      ["rec2", "Zèbre"],
    ]);
  });
});

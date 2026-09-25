import type { DatabaseField } from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import {
  appendChoice,
  filterChoices,
  groupChoices,
  hasChoice,
  isStatusField,
  moveChoice,
  removeChoice,
  renameStatusChoice,
  updateChoice,
} from "./choices";

const choices = [
  { id: "c1", name: "À faire", color: "grayLight2" },
  { id: "c2", name: "En cours", color: "blue" },
  { id: "c3", name: "Terminé", color: "green" },
];

describe("filterChoices", () => {
  it("matches ignoring case and accents", () => {
    expect(filterChoices(choices, "termine").map((c) => c.name)).toEqual([
      "Terminé",
    ]);
    expect(filterChoices(choices, "  ")).toBe(choices);
  });
});

describe("hasChoice", () => {
  it("compares whole names ignoring case", () => {
    expect(hasChoice(choices, "en COURS ")).toBe(true);
    expect(hasChoice(choices, "En")).toBe(false);
  });
});

describe("option edits", () => {
  it("appends a trimmed option with a colour", () => {
    const next = appendChoice(choices, " Bloqué ");
    expect(next).toHaveLength(4);
    expect(next[3].name).toBe("Bloqué");
    expect(next[3].color).toBeTruthy();
  });

  it("keeps the id on rename so that rows follow", () => {
    const next = updateChoice(choices, "En cours", { name: "Doing" });
    expect(next[1]).toEqual({ id: "c2", name: "Doing", color: "blue" });
    expect(updateChoice(choices, "En cours", { name: " " })[1].name).toBe(
      "En cours"
    );
  });

  it("removes and moves options", () => {
    expect(removeChoice(choices, "En cours").map((c) => c.id)).toEqual([
      "c1",
      "c3",
    ]);
    expect(moveChoice(choices, "Terminé", "À faire").map((c) => c.id)).toEqual([
      "c3",
      "c1",
      "c2",
    ]);
    expect(moveChoice(choices, "Terminé", "missing")).toBe(choices);
  });
});

describe("status options", () => {
  const statusGroups = {
    "À faire": DatabaseStatusGroup.ToDo,
    "En cours": DatabaseStatusGroup.InProgress,
    Terminé: DatabaseStatusGroup.Complete,
  };

  it("detects status fields", () => {
    const base: DatabaseField = {
      id: "f",
      name: "Statut",
      type: DatabaseFieldType.SingleSelect,
      options: { choices },
      isPrimary: false,
      isComputed: false,
      isLookup: false,
      cellValueType: "string",
      isMultipleCellValue: false,
    };
    expect(isStatusField(base)).toBe(false);
    expect(isStatusField({ ...base, meta: { statusGroups } })).toBe(true);
  });

  it("sorts options into groups, ungrouped last", () => {
    const sections = groupChoices(
      [...choices, { name: "Autre", color: "red" }],
      statusGroups
    );
    expect(sections.map((section) => section.group)).toEqual([
      DatabaseStatusGroup.ToDo,
      DatabaseStatusGroup.InProgress,
      DatabaseStatusGroup.Complete,
      null,
    ]);
    expect(sections[3].choices.map((c) => c.name)).toEqual(["Autre"]);
  });

  it("follows renames, additions and removals in the groups", () => {
    expect(renameStatusChoice(statusGroups, "En cours", "Doing")).toEqual({
      "À faire": DatabaseStatusGroup.ToDo,
      Doing: DatabaseStatusGroup.InProgress,
      Terminé: DatabaseStatusGroup.Complete,
    });
    expect(renameStatusChoice({}, null, "New")).toEqual({
      New: DatabaseStatusGroup.ToDo,
    });
    expect(
      renameStatusChoice(statusGroups, "Terminé", null)
    ).not.toHaveProperty("Terminé");
  });
});

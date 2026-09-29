import type { DatabaseField } from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseLayout,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import {
  boardGroupField,
  defaultDateField,
  newViewSettings,
} from "./newViewDefaults";

function field(
  id: string,
  type: DatabaseFieldType,
  extra: Partial<DatabaseField> = {}
): DatabaseField {
  return {
    id,
    name: id,
    type,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType:
      type === DatabaseFieldType.Date ||
      type === DatabaseFieldType.CreatedTime ||
      type === DatabaseFieldType.LastModifiedTime
        ? "dateTime"
        : "string",
    isMultipleCellValue: false,
    ...extra,
  };
}

const title = field("Ticket", DatabaseFieldType.SingleLineText, {
  isPrimary: true,
});
const epic = field("Epic", DatabaseFieldType.SingleSelect);
const statut = field("Statut", DatabaseFieldType.SingleSelect);
const created = field("Created", DatabaseFieldType.CreatedTime, {
  isComputed: true,
});
const start = field("Début", DatabaseFieldType.Date, {
  meta: { endFieldId: "Fin" },
});
const end = field("Fin", DatabaseFieldType.Date);

describe("boardGroupField", () => {
  it("prefers a select with status groups", () => {
    const phase = field("Phase", DatabaseFieldType.SingleSelect, {
      meta: { statusGroups: { Fait: DatabaseStatusGroup.Complete } },
    });
    expect(boardGroupField([title, epic, statut, phase])).toBe(phase);
  });

  it("else a select named like a status, in any case and accent", () => {
    expect(boardGroupField([title, epic, statut])).toBe(statut);
    const etat = field("État du ticket", DatabaseFieldType.SingleSelect);
    expect(boardGroupField([title, epic, etat])).toBe(etat);
  });

  it("else the first select", () => {
    const team = field("Équipe", DatabaseFieldType.SingleSelect);
    expect(boardGroupField([title, epic, team])).toBe(epic);
    expect(boardGroupField([title])).toBeUndefined();
  });
});

describe("defaultDateField", () => {
  it("prefers a date property to computed times", () => {
    expect(defaultDateField([title, created, start, end])).toBe(start);
  });

  it("falls back to any single date", () => {
    expect(defaultDateField([title, created])).toBe(created);
    expect(defaultDateField([title])).toBeUndefined();
  });
});

describe("newViewSettings", () => {
  it("groups a board by the status", () => {
    expect(
      newViewSettings(DatabaseLayout.Board, [title, epic, statut])
    ).toEqual({ options: { stackFieldId: "Statut" } });
  });

  it("draws a timeline on the first date and the end of its range", () => {
    expect(
      newViewSettings(DatabaseLayout.Timeline, [title, created, start, end])
    ).toEqual({
      overrides: { timeline: { startFieldId: "Début", endFieldId: "Fin" } },
    });
    expect(newViewSettings(DatabaseLayout.Timeline, [title, end])).toEqual({
      overrides: { timeline: { startFieldId: "Fin" } },
    });
  });

  it("gives a calendar the end of the range, else single-day rows", () => {
    expect(
      newViewSettings(DatabaseLayout.Calendar, [title, start, end])
    ).toEqual({
      options: { startDateFieldId: "Début", endDateFieldId: "Fin" },
    });
    expect(
      newViewSettings(DatabaseLayout.Calendar, [title, created, end])
    ).toEqual({ options: { startDateFieldId: "Fin", endDateFieldId: "Fin" } });
  });

  it("shows a new list's title and its first short properties only", () => {
    const url = field("Notion", DatabaseFieldType.SingleLineText);
    const notes = field("Notes", DatabaseFieldType.LongText);
    const owner = field("Owner", DatabaseFieldType.User);
    const done = field("Done", DatabaseFieldType.Checkbox);
    expect(
      newViewSettings(DatabaseLayout.List, [
        title,
        url,
        epic,
        notes,
        statut,
        owner,
        done,
      ])
    ).toEqual({
      columnMeta: {
        Notion: { hidden: true },
        Notes: { hidden: true },
        Done: { hidden: true },
      },
    });
    expect(newViewSettings(DatabaseLayout.List, [title, statut])).toEqual({});
  });

  it("leaves the engine's defaults without a matching property", () => {
    expect(newViewSettings(DatabaseLayout.Timeline, [title])).toEqual({});
    expect(newViewSettings(DatabaseLayout.Calendar, [title])).toEqual({});
    expect(newViewSettings(DatabaseLayout.Board, [title])).toEqual({});
    expect(newViewSettings(DatabaseLayout.Table, [title, statut])).toEqual({});
  });
});

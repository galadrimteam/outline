import type {
  DatabaseCellValue,
  DatabaseFilter,
  DatabaseFilterItem,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { fieldsById } from "../fields";
import { PARIS, formulaField, makeField } from "../testFixtures";
import { andFilters, compileFilter } from "./filter";

// Wednesday 18 June 2025, 10:30 in Paris.
const NOW = Date.parse("2025-06-18T08:30:00.000Z");
const statusChoices = ["À faire", "En cours", "Terminé"].map((name) => ({
  name,
  color: "gray",
}));

const fields = fieldsById([
  makeField({ id: "title", type: DatabaseFieldType.SingleLineText }),
  makeField({ id: "estimate", type: DatabaseFieldType.Number }),
  makeField({ id: "done", type: DatabaseFieldType.Checkbox }),
  makeField({
    id: "status",
    type: DatabaseFieldType.SingleSelect,
    options: { choices: statusChoices },
  }),
  makeField({
    id: "tags",
    type: DatabaseFieldType.MultipleSelect,
    options: {
      choices: [
        { name: "Front", color: "red" },
        { name: "Back", color: "blue" },
      ],
    },
  }),
  makeField({ id: "owner", type: DatabaseFieldType.User }),
  makeField({
    id: "team",
    type: DatabaseFieldType.User,
    options: { isMultiple: true },
  }),
  makeField({ id: "epic", type: DatabaseFieldType.Link }),
  makeField({
    id: "edited",
    type: DatabaseFieldType.LastModifiedTime,
    options: {
      formatting: { date: "D MMMM YYYY", time: "HH:mm", timeZone: PARIS },
    },
  }),
  makeField({
    id: "due",
    type: DatabaseFieldType.Date,
    options: {
      formatting: { date: "D MMMM YYYY", time: "None", timeZone: PARIS },
    },
  }),
  formulaField("score", "{estimate} * 2", "number"),
  makeField({
    id: "epicOwners",
    type: DatabaseFieldType.User,
    isLookup: true,
    isMultipleCellValue: true,
  }),
  makeField({ id: "files", type: DatabaseFieldType.Attachment }),
]);

const rows: Record<string, Record<string, DatabaseCellValue>> = {
  todo: {
    title: "Maquette accueil",
    estimate: 3,
    status: "À faire",
    tags: ["Front"],
    owner: { id: "user-ada", title: "Ada" },
    team: [
      { id: "user-ada", title: "Ada" },
      { id: "user-bob", title: "Bob" },
    ],
    epic: [{ id: "recEpic1", title: "Accueil" }],
    edited: "2025-06-01T08:00:00.000Z",
    due: "2025-06-17T22:00:00.000Z",
    score: 6,
  },
  doneRecently: {
    title: "API connexion",
    estimate: 5,
    done: true,
    status: "Terminé",
    tags: ["Back", "Front"],
    owner: { id: "user-bob", title: "Bob" },
    team: [{ id: "user-bob", title: "Bob" }],
    edited: "2025-06-16T12:00:00.000Z",
    due: "2025-06-10T22:00:00.000Z",
    score: 10,
    epicOwners: [{ id: "user-ada", title: "Ada" }],
    files: [
      { id: "act1", name: "spec.pdf", mimetype: "application/pdf", size: 10 },
    ],
  },
  doneLongAgo: {
    title: "Base de données",
    status: "Terminé",
    edited: "2025-05-02T08:00:00.000Z",
  },
  empty: {},
};

const context = { now: NOW, timeZone: PARIS, userId: "user-ada" };
const item = (
  fieldId: string,
  operator: DatabaseFilterItem["operator"],
  value: DatabaseFilterItem["value"] = null
): DatabaseFilterItem => ({ fieldId, operator, value });
const matching = (filter: DatabaseFilter | null) => {
  const test = compileFilter(filter, fields, context);
  return Object.keys(rows).filter((id) => !test || test(rows[id]));
};
const only = (node: DatabaseFilterItem) =>
  matching({ conjunction: "and", filterSet: [node] });

describe("compileFilter: nested groups", () => {
  // Notion's « not done, or done and edited this past week », narrowed to a
  // board column the way Outline does it: three levels of groups.
  const recentWork: DatabaseFilter = {
    conjunction: "or",
    filterSet: [
      item("status", "isNot", "Terminé"),
      {
        conjunction: "and",
        filterSet: [
          item("status", "is", "Terminé"),
          item("edited", "isWithIn", { mode: "pastWeek", timeZone: PARIS }),
        ],
      },
    ],
  };

  it("joins each group by its own conjunction, at any depth", () => {
    expect(matching(recentWork)).toEqual(["todo", "doneRecently", "empty"]);
    const column = andFilters(recentWork, {
      conjunction: "and",
      filterSet: [item("status", "is", "Terminé")],
    });
    expect(matching(column)).toEqual(["doneRecently"]);
    const deeper: DatabaseFilter = {
      conjunction: "and",
      filterSet: [
        {
          conjunction: "or",
          filterSet: [
            item("title", "contains", "maquette"),
            {
              conjunction: "and",
              filterSet: [
                item("estimate", "isGreater", 4),
                { conjunction: "or", filterSet: [item("done", "is", true)] },
              ],
            },
          ],
        },
      ],
    };
    expect(matching(deeper)).toEqual(["todo", "doneRecently"]);
  });

  it("drops rules on unknown fields, rules without a value and empty groups", () => {
    expect(
      matching({
        conjunction: "or",
        filterSet: [
          item("status", "is", "Terminé"),
          item("gone", "is", "x"),
          item("title", "contains", null),
          item("owner", "isAnyOf", []),
          { conjunction: "and", filterSet: [] },
        ],
      })
    ).toEqual(["doneRecently", "doneLongAgo"]);
    expect(
      matching({ conjunction: "and", filterSet: [item("gone", "is", "x")] })
    ).toEqual(Object.keys(rows));
    expect(matching(null)).toEqual(Object.keys(rows));
  });
});

describe("compileFilter: rules per kind of field", () => {
  it("matches text exactly with is, without case with contains, blanks with negations", () => {
    expect(only(item("title", "is", "API connexion"))).toEqual([
      "doneRecently",
    ]);
    expect(only(item("title", "is", "api connexion"))).toEqual([]);
    expect(only(item("title", "contains", "BASE"))).toEqual(["doneLongAgo"]);
    expect(only(item("title", "doesNotContain", "a"))).toEqual(["empty"]);
    expect(only(item("title", "isNot", "API connexion"))).toEqual([
      "todo",
      "doneLongAgo",
      "empty",
    ]);
    expect(only(item("title", "isEmpty"))).toEqual(["empty"]);
    expect(only(item("title", "isNotEmpty"))).toHaveLength(3);
  });

  it("compares numbers, computed ones included", () => {
    expect(only(item("estimate", "is", 3))).toEqual(["todo"]);
    expect(only(item("estimate", "isNot", "3"))).toEqual([
      "doneRecently",
      "doneLongAgo",
      "empty",
    ]);
    expect(only(item("estimate", "isGreaterEqual", 3))).toEqual([
      "todo",
      "doneRecently",
    ]);
    expect(only(item("estimate", "isLess", 4))).toEqual(["todo"]);
    expect(only(item("score", "isGreater", 7))).toEqual(["doneRecently"]);
  });

  it("reads checkboxes: unchecked matches empty cells", () => {
    expect(only(item("done", "is", true))).toEqual(["doneRecently"]);
    expect(only(item("done", "is", false))).toEqual([
      "todo",
      "doneLongAgo",
      "empty",
    ]);
    expect(only(item("done", "is", null))).toEqual([
      "todo",
      "doneLongAgo",
      "empty",
    ]);
  });

  it("reads single and multiple selects", () => {
    expect(only(item("status", "isAnyOf", ["À faire", "En cours"]))).toEqual([
      "todo",
    ]);
    expect(only(item("status", "isNoneOf", ["Terminé"]))).toEqual([
      "todo",
      "empty",
    ]);
    expect(only(item("tags", "hasAnyOf", ["Back"]))).toEqual(["doneRecently"]);
    expect(only(item("tags", "hasAllOf", ["Front", "Back"]))).toEqual([
      "doneRecently",
    ]);
    expect(only(item("tags", "isExactly", ["Front"]))).toEqual(["todo"]);
    expect(only(item("tags", "isNotExactly", ["Front"]))).toEqual([
      "doneRecently",
      "doneLongAgo",
      "empty",
    ]);
    expect(only(item("tags", "hasNoneOf", ["Front"]))).toEqual([
      "doneLongAgo",
      "empty",
    ]);
    expect(only(item("tags", "is", "front"))).toEqual(["todo", "doneRecently"]);
  });

  it("reads people by id, Me being the reader", () => {
    expect(only(item("owner", "is", "Me"))).toEqual(["todo"]);
    expect(only(item("owner", "isNot", "Me"))).toEqual([
      "doneRecently",
      "doneLongAgo",
      "empty",
    ]);
    expect(only(item("owner", "isAnyOf", ["Me", "user-bob"]))).toEqual([
      "todo",
      "doneRecently",
    ]);
    expect(only(item("team", "hasAnyOf", ["Me"]))).toEqual(["todo"]);
    expect(only(item("team", "hasAllOf", ["user-ada", "user-bob"]))).toEqual([
      "todo",
    ]);
    expect(only(item("team", "isExactly", ["user-bob"]))).toEqual([
      "doneRecently",
    ]);
    expect(only(item("epicOwners", "hasAnyOf", ["Me"]))).toEqual([
      "doneRecently",
    ]);
    const anonymous = compileFilter(
      { conjunction: "and", filterSet: [item("owner", "is", "Me")] },
      fields,
      { now: NOW, timeZone: PARIS }
    );
    expect(Object.values(rows).filter((cells) => anonymous?.(cells))).toEqual(
      []
    );
  });

  it("reads links by id and by title", () => {
    expect(only(item("epic", "hasAnyOf", ["recEpic1"]))).toEqual(["todo"]);
    expect(only(item("epic", "contains", "accu"))).toEqual(["todo"]);
    expect(only(item("epic", "doesNotContain", "accu"))).toEqual([
      "doneRecently",
      "doneLongAgo",
      "empty",
    ]);
  });

  it("reads dates in the field's zone", () => {
    const today = { mode: "today" as const, timeZone: PARIS };
    expect(only(item("due", "is", today))).toEqual(["todo"]);
    expect(only(item("due", "isNot", today))).toEqual([
      "doneRecently",
      "doneLongAgo",
      "empty",
    ]);
    expect(only(item("due", "isBefore", today))).toEqual(["doneRecently"]);
    expect(only(item("due", "isOnOrBefore", today))).toEqual([
      "todo",
      "doneRecently",
    ]);
    expect(
      only(item("due", "isAfter", { mode: "yesterday", timeZone: PARIS }))
    ).toEqual(["todo"]);
    expect(
      only(
        item("due", "isWithIn", {
          mode: "pastNumberOfDays",
          numberOfDays: 10,
          timeZone: PARIS,
        })
      )
    ).toEqual(["todo", "doneRecently"]);
    expect(
      only(item("due", "is", { mode: "daysAgo", timeZone: PARIS }))
    ).toEqual(Object.keys(rows));
    expect(only(item("due", "is", "2025-06-18"))).toEqual(Object.keys(rows));
  });

  it("tests attachments for emptiness", () => {
    expect(only(item("files", "isNotEmpty"))).toEqual(["doneRecently"]);
    expect(only(item("files", "isEmpty"))).toHaveLength(3);
  });
});

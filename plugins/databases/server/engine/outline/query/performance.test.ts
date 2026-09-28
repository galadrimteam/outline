import type { DatabaseCellValue } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { EngineFieldRow, TableSnapshot } from "../types";
import { outlineQuery } from ".";
import {
  PARIS,
  contextAt,
  formulaField,
  makeField,
  makeRecord,
  makeTable,
  makeView,
} from "./testFixtures";

const RECORDS = 10_000;
const PROJECTS = 200;
const statuses = ["Backlog", "À faire", "En cours", "En revue", "Terminé"];
const dateOptions = {
  formatting: { date: "D MMMM YYYY", time: "None", timeZone: PARIS },
};

/** A base of 200 projects and 10 000 tasks of 30 fields, a third of them computed. */
function largeBase(): { tasks: TableSnapshot; projects: TableSnapshot } {
  const taskFields: EngineFieldRow[] = [
    makeField({ id: "fldTitle", type: DatabaseFieldType.SingleLineText }),
    makeField({ id: "fldNotes", type: DatabaseFieldType.LongText }),
    makeField({ id: "fldEstimate", type: DatabaseFieldType.Number }),
    makeField({ id: "fldSpent", type: DatabaseFieldType.Number }),
    makeField({ id: "fldRate", type: DatabaseFieldType.Number }),
    makeField({
      id: "fldStart",
      type: DatabaseFieldType.Date,
      options: dateOptions,
    }),
    makeField({
      id: "fldEnd",
      type: DatabaseFieldType.Date,
      options: dateOptions,
    }),
    makeField({
      id: "fldStatus",
      type: DatabaseFieldType.SingleSelect,
      options: { choices: statuses.map((name) => ({ name, color: "gray" })) },
    }),
    makeField({
      id: "fldTags",
      type: DatabaseFieldType.MultipleSelect,
      options: {
        choices: ["front", "back", "ops"].map((name) => ({
          name,
          color: "gray",
        })),
      },
    }),
    makeField({ id: "fldDone", type: DatabaseFieldType.Checkbox }),
    makeField({ id: "fldOwner", type: DatabaseFieldType.User }),
    makeField({ id: "fldPriority", type: DatabaseFieldType.Rating }),
    makeField({ id: "fldUrl", type: DatabaseFieldType.SingleLineText }),
    makeField({ id: "fldCode", type: DatabaseFieldType.SingleLineText }),
    makeField({
      id: "fldProject",
      type: DatabaseFieldType.Link,
      options: { foreignTableId: "tblProjects", relationship: "manyOne" },
    }),
    makeField({
      id: "fldProjectBudget",
      type: DatabaseFieldType.Number,
      isLookup: true,
      isMultipleCellValue: false,
      lookupOptions: {
        foreignTableId: "tblProjects",
        linkFieldId: "fldProject",
        lookupFieldId: "fldBudget",
      },
    }),
    makeField({ id: "fldAuto", type: DatabaseFieldType.AutoNumber }),
    makeField({ id: "fldCreated", type: DatabaseFieldType.CreatedTime }),
    makeField({ id: "fldCreator", type: DatabaseFieldType.CreatedBy }),
    formulaField("fldCost", "ROUND({fldSpent} * {fldRate}, 2)", "number"),
    formulaField(
      "fldGap",
      "IF({fldSpent} > 0, {fldSpent} - {fldEstimate}, BLANK())",
      "number"
    ),
    formulaField(
      "fldDays",
      'IF(DATETIME_DIFF({fldEnd}, {fldStart}, "day") >= 0, FLOOR(DATETIME_DIFF({fldEnd}, {fldStart}, "day")), CEILING(DATETIME_DIFF({fldEnd}, {fldStart}, "day")))',
      "number"
    ),
    formulaField("fldLabel", '{fldCode} & " – " & UPPER({fldTitle})', "string"),
    formulaField(
      "fldLate",
      "AND(NOT({fldDone}), {fldEnd} < TODAY())",
      "boolean"
    ),
    formulaField("fldDue", 'DATE_ADD({fldStart}, 14, "days")', "dateTime", {
      options: dateOptions,
    }),
    formulaField(
      "fldWhen",
      'DATETIME_FORMAT({fldStart}, "D MMMM YYYY")',
      "string"
    ),
    formulaField(
      "fldPhase",
      'SWITCH({fldStatus}, "Terminé", "Fini", "En cours", "Actif", "Autre")',
      "string"
    ),
    formulaField("fldShare", "{fldCost} / {fldProjectBudget}", "number"),
    formulaField("fldTagCount", "COUNTA({fldTags})", "number"),
  ];
  const projectFields: EngineFieldRow[] = [
    makeField({ id: "fldName", type: DatabaseFieldType.SingleLineText }),
    makeField({ id: "fldBudget", type: DatabaseFieldType.Number }),
    makeField({
      id: "fldTasks",
      type: DatabaseFieldType.Link,
      options: { foreignTableId: "tblTasks" },
    }),
    makeField({
      id: "fldTotalCost",
      type: DatabaseFieldType.Rollup,
      isComputed: true,
      cellValueType: "number",
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: "tblTasks",
        linkFieldId: "fldTasks",
        lookupFieldId: "fldCost",
      },
    }),
    makeField({
      id: "fldLastEnd",
      type: DatabaseFieldType.Rollup,
      isComputed: true,
      cellValueType: "dateTime",
      options: { expression: "max({values})", ...dateOptions },
      lookupOptions: {
        foreignTableId: "tblTasks",
        linkFieldId: "fldTasks",
        lookupFieldId: "fldDue",
      },
    }),
    formulaField(
      "fldUsage",
      "ROUND({fldTotalCost} / {fldBudget} * 100, 1)",
      "number"
    ),
  ];

  const tasksByProject = new Map<string, { id: string }[]>();
  const taskRecords = Array.from({ length: RECORDS }, (_value, index) => {
    const project = `recProject${index % PROJECTS}`;
    tasksByProject.set(project, [
      ...(tasksByProject.get(project) ?? []),
      { id: `recTask${index}` },
    ]);
    const start = Date.UTC(2025, 0, 1) + (index % 365) * 86_400_000;
    const cells: Record<string, DatabaseCellValue> = {
      fldTitle: `Tâche numéro ${index}`,
      fldNotes: index % 3 ? `Note ${index}\nsur deux lignes` : null,
      fldEstimate: index % 13,
      fldSpent: index % 7 ? (index % 17) + 0.5 : null,
      fldRate: 400 + (index % 5) * 50,
      fldStart: new Date(start).toISOString(),
      fldEnd: new Date(start + (index % 30) * 86_400_000).toISOString(),
      fldStatus: statuses[index % statuses.length],
      fldTags: index % 4 ? ["front", "back"].slice(0, (index % 2) + 1) : null,
      fldDone: index % 5 === 4 ? true : null,
      fldOwner: { id: `user-${index % 20}`, title: `Personne ${index % 20}` },
      fldPriority: (index % 5) + 1,
      fldUrl: `https://example.com/${index}`,
      fldCode: `T-${index}`,
      fldProject: [{ id: project }],
    };
    return makeRecord(`recTask${index}`, cells, { autoNumber: index + 1 });
  });
  const projectRecords = Array.from({ length: PROJECTS }, (_value, index) =>
    makeRecord(`recProject${index}`, {
      fldName: `Projet ${index}`,
      fldBudget: 100_000 + index,
      fldTasks: tasksByProject.get(`recProject${index}`) ?? [],
    })
  );
  const view = makeView({
    id: "viwBoard",
    filter: {
      conjunction: "or",
      filterSet: [
        { fieldId: "fldStatus", operator: "isNot", value: "Terminé" },
        {
          conjunction: "and",
          filterSet: [
            { fieldId: "fldStatus", operator: "is", value: "Terminé" },
            {
              fieldId: "fldDue",
              operator: "isWithIn",
              value: { mode: "pastMonth", timeZone: PARIS },
            },
          ],
        },
      ],
    },
    sort: { sortObjs: [{ fieldId: "fldTitle", order: "asc" }] },
    group: [{ fieldId: "fldStatus", order: "asc" }],
  });
  return {
    tasks: makeTable("tblTasks", taskFields, taskRecords, [view]),
    projects: makeTable("tblProjects", projectFields, projectRecords),
  };
}

describe("performance", () => {
  const { tasks, projects } = largeBase();
  const context = contextAt("2025-06-15T10:00:00.000Z", "user-3");

  it("computes, selects, groups and aggregates 10 000 records of 30 fields quickly", () => {
    const started = performance.now();
    const base = outlineQuery.computeBase([tasks, projects], context);
    const computed = performance.now();

    const view = tasks.views[0];
    const records = outlineQuery.select(
      tasks,
      base,
      { view, search: "numéro 12" },
      context
    );
    const all = outlineQuery.select(tasks, base, { view }, context);
    const points = outlineQuery.groupPoints(tasks, all, view.group ?? []);
    const stats = outlineQuery.aggregate(tasks, all, {
      fldCost: "sum",
      fldEnd: "latestDate",
      fldOwner: "unique",
    });
    const finished = performance.now();

    expect(base.records("tblTasks")).toHaveLength(RECORDS);
    expect(base.record("tblTasks", "recTask0")?.cells.fldProjectBudget).toBe(
      100_000
    );
    expect(
      base.record("tblProjects", "recProject0")?.cells.fldTotalCost
    ).toBeGreaterThan(0);
    expect(records.length).toBeGreaterThan(0);
    expect(points.filter((point) => point.type === "row")).toHaveLength(
      statuses.length
    );
    expect(stats.fldOwner.value).toBe(20);

    // About 0.1 s each on a laptop (0.07 s warm); the bounds leave room for a loaded CI machine.
    expect(computed - started).toBeLessThan(3000);
    expect(finished - computed).toBeLessThan(3000);
  });
});

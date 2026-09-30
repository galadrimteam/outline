import { DatabaseFieldType } from "@shared/databases/types";
import { makeField } from "../views/TableView/testFixtures";
import { focusedTabIndex, relationTabColumns, rowPageTabs } from "./pageTabs";

const tasks = makeField({
  id: "tasks",
  name: "Suivi Kanban MGE",
  type: DatabaseFieldType.Link,
});
const notes = makeField({ id: "notes", name: "Notes" });
const fields = [makeField({ id: "title", isPrimary: true }), tasks, notes];

describe("rowPageTabs", () => {
  it("shows no tabs without a relation tab", () => {
    expect(rowPageTabs(undefined, fields, "Content")).toEqual([]);
    expect(
      rowPageTabs([{ id: "body", kind: "content" }], fields, "Content")
    ).toEqual([]);
  });

  it("names the tabs after the content and the relation field", () => {
    expect(
      rowPageTabs(
        [
          { id: "body", kind: "content" },
          {
            id: "kanban",
            kind: "relation",
            fieldId: "tasks",
            visibleFieldIds: ["status"],
          },
          { id: "named", kind: "relation", fieldId: "tasks", name: "Tâches" },
        ],
        fields,
        "Content"
      )
    ).toEqual([
      { kind: "content", id: "body", name: "Content" },
      {
        kind: "relation",
        id: "kanban",
        name: "Suivi Kanban MGE",
        field: tasks,
        visibleFieldIds: ["status"],
      },
      {
        kind: "relation",
        id: "named",
        name: "Tâches",
        field: tasks,
        visibleFieldIds: [],
      },
    ]);
  });

  it("drops a relation tab whose field is missing or no relation", () => {
    expect(
      rowPageTabs(
        [
          { id: "body", kind: "content", name: "Page" },
          { id: "gone", kind: "relation", fieldId: "deleted" },
          { id: "text", kind: "relation", fieldId: "notes" },
        ],
        fields,
        "Content"
      )
    ).toEqual([]);
  });

  it("keeps the body reachable with one content tab", () => {
    const tabs = rowPageTabs(
      [
        { id: "kanban", kind: "relation", fieldId: "tasks" },
        { id: "kanban", kind: "relation", fieldId: "tasks" },
      ],
      fields,
      "Content"
    );
    expect(tabs.map((tab) => [tab.kind, tab.id])).toEqual([
      ["content", "content"],
      ["relation", "kanban"],
    ]);

    const twice = rowPageTabs(
      [
        { id: "kanban", kind: "relation", fieldId: "tasks" },
        { id: "body", kind: "content" },
        { id: "again", kind: "content" },
      ],
      fields,
      "Content"
    );
    expect(twice.map((tab) => tab.id)).toEqual(["kanban", "body"]);
  });
});

describe("relationTabColumns", () => {
  const linked = [
    makeField({ id: "name", isPrimary: true }),
    makeField({ id: "icon" }),
    makeField({ id: "status" }),
    makeField({ id: "owner" }),
  ];

  it("follows the tab's order, without the title, the icon and unknown fields", () => {
    expect(
      relationTabColumns(
        linked,
        ["owner", "name", "icon", "deleted", "status", "owner"],
        "icon"
      ).map((field) => field.id)
    ).toEqual(["owner", "status"]);
  });

  it("shows the title alone by default", () => {
    expect(relationTabColumns(linked, [])).toEqual([]);
  });
});

describe("focusedTabIndex", () => {
  it("moves with the arrows, wrapping around, and jumps with Home and End", () => {
    expect(focusedTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(focusedTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(focusedTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(focusedTabIndex("Home", 2, 3)).toBe(0);
    expect(focusedTabIndex("End", 0, 3)).toBe(2);
    expect(focusedTabIndex("Enter", 0, 3)).toBeUndefined();
    expect(focusedTabIndex("ArrowRight", 0, 0)).toBeUndefined();
  });
});

import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseUserValue,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { buildTeam } from "@server/test/factories";
import type { DatabaseChange } from "../../utils/DatabaseChangePublisher";
import type {
  DatabaseEngineUserInput,
  DatabaseRef,
  DatabaseUserActor,
} from "../DatabaseEngine";
import type { EngineAttachmentStorage } from "./attachments";
import { ComputedBaseCache } from "./ComputedBaseCache";
import { generateEngineId } from "./ids";
import { OutlineEngine } from "./OutlineEngine";
import { OutlineTablesDuplicator } from "./OutlineTablesDuplicator";
import { outlineQuery } from "./query";
import { InMemoryOutlineStore } from "./store/InMemoryOutlineStore";
import type { OutlineStore } from "./store/OutlineStore";
import { SequelizeOutlineStore } from "./store/SequelizeOutlineStore";
import type { EngineUserDirectory } from "./users";
import { emailUserId } from "./users";

/** People known by id, named from a map. */
class FakeUserDirectory implements EngineUserDirectory {
  public people = new Map<string, DatabaseUserValue>();

  async ensureUsers(
    _teamId: string,
    users: DatabaseEngineUserInput[]
  ): Promise<Map<string, string>> {
    return new Map(
      users.map((user) => {
        const email = user.email.toLowerCase();
        const known = [...this.people.values()].find(
          (person) => person.email === email
        );
        return [email, known?.id ?? emailUserId(email)];
      })
    );
  }

  async describe(
    _teamId: string,
    ids: string[]
  ): Promise<Map<string, DatabaseUserValue>> {
    return new Map(
      ids.flatMap((id) => {
        const person = this.people.get(id);
        return person ? [[id, person] as const] : [];
      })
    );
  }
}

const ada: DatabaseUserActor = {
  email: "ada@example.com",
  name: "Ada",
  outlineUserId: "user-ada",
};

const stores: [string, () => OutlineStore][] = [
  ["InMemoryOutlineStore", () => new InMemoryOutlineStore()],
  ["SequelizeOutlineStore", () => new SequelizeOutlineStore()],
];

describe.each(stores)("OutlineEngine on %s", (_name, makeStore) => {
  let store: OutlineStore;
  let engine: OutlineEngine;
  let published: DatabaseChange[];
  let users: FakeUserDirectory;
  let teamId: string;

  beforeEach(async () => {
    store = makeStore();
    teamId = (await buildTeam()).id;
    published = [];
    users = new FakeUserDirectory();
    users.people.set(ada.outlineUserId, {
      id: ada.outlineUserId,
      title: ada.name,
      email: ada.email,
    });
    engine = engineWith({});
  });

  function engineWith(overrides: { attachments?: EngineAttachmentStorage }) {
    return new OutlineEngine({
      store,
      query: outlineQuery,
      users,
      attachments: overrides.attachments ?? {
        store: () => Promise.reject(new Error("no files here")),
      },
      publish: async (change) => {
        published.push(change);
      },
      computedBases: new ComputedBaseCache(),
      teamId,
      origin: "tab-1",
    });
  }

  /** A Delisle-like board: tasks stacked by status. */
  async function boardTable(baseId?: string) {
    const externalBaseId = baseId ?? (await engine.createBase("Delisle"));
    const table = await engine.createTable(ada, externalBaseId, {
      name: "Tasks",
      fields: [
        { key: "name", name: "Name", type: DatabaseFieldType.SingleLineText },
        {
          key: "status",
          name: "Status",
          type: DatabaseFieldType.SingleSelect,
          options: {
            choices: [
              { name: "To do", color: "grayBright" },
              { name: "In progress", color: "blueBright" },
              { name: "Done", color: "greenBright" },
            ],
          },
        },
      ],
      view: {
        name: "Board",
        layout: DatabaseLayout.Board,
        stackFieldKey: "status",
      },
    });
    const ref: DatabaseRef = {
      externalBaseId,
      externalTableId: table.externalTableId,
    };
    return {
      ref,
      name: table.fieldIds.name,
      status: table.fieldIds.status,
      board: table.views[0].id,
      table,
    };
  }

  async function names(
    ref: DatabaseRef,
    filter?: { fieldId: string; value: string }
  ) {
    const board = (await engine.getSchema(ada, ref)).views[0];
    const page = await engine.listRecords(ada, ref, {
      viewId: board.id,
      filter: filter
        ? {
            conjunction: "and",
            filterSet: [
              { fieldId: filter.fieldId, operator: "is", value: filter.value },
            ],
          }
        : null,
      skip: 0,
      take: 100,
    });
    const schema = await engine.getSchema(ada, ref);
    const primary = schema.fields.find((field) => field.isPrimary);
    return page.records.map((record) => record.fields[primary?.id ?? ""]);
  }

  describe("a kanban board", () => {
    it("creates a table with its primary field and a board stacked by status", async () => {
      const { table, status, name } = await boardTable();
      expect(table.fields.find((field) => field.isPrimary)?.id).toBe(name);
      expect(table.views).toHaveLength(1);
      expect(table.views[0]).toMatchObject({
        type: "kanban",
        layout: DatabaseLayout.Board,
        options: { stackFieldId: status },
      });
      expect(table.views[0].columnMeta[name]).toMatchObject({
        order: 0,
        visible: true,
      });
    });

    it("moves a card within its column and to another column", async () => {
      const { ref, name, status, board } = await boardTable();
      const ids: Record<string, string> = {};
      for (const [title, state] of [
        ["A", "To do"],
        ["B", "To do"],
        ["C", "To do"],
        ["D", "In progress"],
      ]) {
        const record = await engine.createRecord(ada, ref, {
          fields: { [name]: title, [status]: state },
        });
        ids[title] = record.id;
      }

      await engine.moveRecords(ada, ref, {
        viewId: board,
        recordIds: [ids.C],
        anchorId: ids.A,
        position: "before",
      });
      expect(await names(ref, { fieldId: status, value: "To do" })).toEqual([
        "C",
        "A",
        "B",
      ]);

      published.length = 0;
      const [moved] = await engine.moveRecords(ada, ref, {
        viewId: board,
        recordIds: [ids.B],
        anchorId: ids.D,
        position: "after",
        fields: { [status]: "In progress" },
      });
      expect(moved.fields[status]).toBe("In progress");
      expect(await names(ref, { fieldId: status, value: "To do" })).toEqual([
        "C",
        "A",
      ]);
      expect(
        await names(ref, { fieldId: status, value: "In progress" })
      ).toEqual(["D", "B"]);

      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        tableId: ref.externalTableId,
        kinds: ["record.update"],
        recordIds: [ids.B],
        origin: "tab-1",
        actor: { outlineUserId: ada.outlineUserId },
      });
      expect(published[0].changes).toContainEqual({
        recordId: ids.B,
        fieldId: status,
        before: "To do",
        after: "In progress",
      });
    });

    it("adds a card next to another one, and last in the other views", async () => {
      const { ref, name, status, board } = await boardTable();
      const a = await engine.createRecord(ada, ref, {
        fields: { [name]: "A", [status]: "To do" },
      });
      await engine.createRecord(ada, ref, {
        fields: { [name]: "B", [status]: "To do" },
      });
      const grid = await engine.createView(ada, ref, {
        name: "Grid",
        type: "grid",
      });
      await engine.createRecord(ada, ref, {
        fields: { [name]: "New", [status]: "To do" },
        order: { viewId: board, anchorId: a.id, position: "before" },
      });

      expect(await names(ref)).toEqual(["New", "A", "B"]);
      const inGrid = await engine.listRecords(ada, ref, {
        viewId: grid.id,
        skip: 0,
        take: 10,
      });
      expect(inGrid.records.map((record) => record.fields[name])).toEqual([
        "A",
        "B",
        "New",
      ]);
    });

    it("counts the cards of each column", async () => {
      const { ref, name, status, board } = await boardTable();
      for (const state of ["To do", "Done", "To do"]) {
        await engine.createRecord(ada, ref, {
          fields: { [name]: state, [status]: state },
        });
      }
      const points = await engine.groupPoints(ada, ref, {
        viewId: board,
        groupBy: [{ fieldId: status, order: "asc" }],
      });
      const counts = points.flatMap((point, index) =>
        point.type === "header"
          ? [
              [
                point.value,
                points[index + 1]?.type === "row" ? points[index + 1] : null,
              ],
            ]
          : []
      );
      expect(counts).toEqual([
        ["To do", { type: "row", count: 2 }],
        ["Done", { type: "row", count: 1 }],
      ]);
    });

    it("computes the calculations of each group of a grouped view", async () => {
      const { ref, name, status } = await boardTable();
      for (const state of ["To do", "Done", "To do"]) {
        await engine.createRecord(ada, ref, {
          fields: { [name]: state, [status]: state },
        });
      }
      const grid = await engine.createView(ada, ref, {
        name: "Grid",
        type: "grid",
      });
      await engine.updateView(ada, ref, grid.id, {
        group: [{ fieldId: status, order: "asc" }],
      });
      const points = await engine.groupPoints(ada, ref, { viewId: grid.id });
      const headerIds: Record<string, string> = Object.fromEntries(
        points.flatMap((point) =>
          point.type === "header" ? [[String(point.value), point.id]] : []
        )
      );

      const flat = await engine.aggregate(ada, ref, {
        viewId: grid.id,
        fieldStats: { [name]: "count" },
      });
      expect(flat[name]).toEqual({ value: 3 });

      const grouped = await engine.aggregate(ada, ref, {
        viewId: grid.id,
        fieldStats: { [name]: "count" },
        byGroup: true,
      });
      expect(grouped[name]).toEqual({
        value: 3,
        groups: { [headerIds["To do"]]: 2, [headerIds.Done]: 1 },
      });
    });

    it("keeps a record's history, newest first, with its author", async () => {
      const { ref, name } = await boardTable();
      const record = await engine.createRecord(ada, ref, {
        fields: { [name]: "One" },
      });
      await engine.updateRecord(ada, ref, record.id, {
        fields: { [name]: "Two" },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await engine.updateRecord(ada, ref, record.id, {
        fields: { [name]: "Three" },
      });

      const history = await engine.recordHistory(ada, ref, record.id);
      expect(
        history.entries.map((entry) => [entry.before, entry.after])
      ).toEqual([
        ["Two", "Three"],
        ["One", "Two"],
      ]);
      expect(history.entries[0]).toMatchObject({
        fieldId: name,
        fieldName: "Name",
        fieldType: DatabaseFieldType.SingleLineText,
        createdBy: { id: ada.outlineUserId, title: "Ada", email: ada.email },
      });
    });

    it("stores people as engine users and names who created a record", async () => {
      const { ref, name } = await boardTable();
      const owner = await engine.createField(ada, ref, {
        name: "Owner",
        type: DatabaseFieldType.User,
      });
      const createdBy = await engine.createField(ada, ref, {
        name: "Created by",
        type: DatabaseFieldType.CreatedBy,
      });
      const record = await engine.createRecord(ada, ref, {
        fields: {
          [name]: "Task",
          [owner.id]: {
            id: ada.outlineUserId,
            title: "Ada",
            email: ada.email,
            outlineUserId: ada.outlineUserId,
          },
        },
      });

      expect(record.fields[owner.id]).toEqual({
        id: ada.outlineUserId,
        title: "Ada",
        email: ada.email,
      });
      expect(record.fields[createdBy.id]).toEqual({
        id: ada.outlineUserId,
        title: "Ada",
        email: ada.email,
      });
      expect(record.createdBy).toBe(ada.outlineUserId);
      expect(
        await engine.ensureUsers([{ email: "Bob@Example.com", name: "Bob" }])
      ).toEqual(new Map([["bob@example.com", "email:bob@example.com"]]));
    });

    it("reports the cells of the records a write reaches only", async () => {
      const { ref, name } = await boardTable();
      const clock = await engine.createField(ada, ref, {
        name: "Clock",
        type: DatabaseFieldType.Formula,
        options: { expression: "NOW()" },
      });
      const a = await engine.createRecord(ada, ref, {
        fields: { [name]: "A" },
      });
      const b = await engine.createRecord(ada, ref, {
        fields: { [name]: "B" },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      published.length = 0;
      await engine.updateRecord(ada, ref, a.id, { fields: { [name]: "A2" } });

      const changed = new Set(
        published[0].changes?.map((change) => change.recordId)
      );
      expect([...changed]).toEqual([a.id]);
      expect(published[0].changes).toContainEqual(
        expect.objectContaining({
          recordId: a.id,
          fieldId: name,
          before: "A",
          after: "A2",
        })
      );
      expect(
        published[0].changes?.some((change) => change.recordId === b.id)
      ).toBe(false);
      expect(clock.cellValueType).toBe("dateTime");
    });

    it("renames the values of a choice renamed, and drops those of a choice removed", async () => {
      const { ref, name, status, table } = await boardTable();
      const choices =
        table.fields.find((field) => field.id === status)?.options.choices ??
        [];
      expect(choices.every((choice) => !!choice.id)).toBe(true);
      const a = await engine.createRecord(ada, ref, {
        fields: { [name]: "A", [status]: "To do" },
      });
      const b = await engine.createRecord(ada, ref, {
        fields: { [name]: "B", [status]: "Done" },
      });

      await engine.convertField(ada, ref, status, {
        type: DatabaseFieldType.SingleSelect,
        options: {
          choices: [{ ...choices[0], name: "Backlog" }, choices[1]],
        },
      });

      expect((await engine.getRecord(ada, ref, a.id)).fields[status]).toBe(
        "Backlog"
      );
      expect(
        (await engine.getRecord(ada, ref, b.id)).fields[status]
      ).toBeUndefined();
    });

    it("converts a text field to a select holding its values", async () => {
      const { ref, name } = await boardTable();
      const category = await engine.createField(ada, ref, {
        name: "Category",
        type: DatabaseFieldType.SingleLineText,
      });
      for (const value of ["Kitchen", "Roof", "Kitchen"]) {
        await engine.createRecord(ada, ref, {
          fields: { [name]: value, [category.id]: value },
        });
      }

      const converted = await engine.convertField(ada, ref, category.id, {
        type: DatabaseFieldType.SingleSelect,
      });

      expect(converted.type).toBe(DatabaseFieldType.SingleSelect);
      expect(converted.options.choices?.map((choice) => choice.name)).toEqual([
        "Kitchen",
        "Roof",
      ]);
      const page = await engine.listRecords(ada, ref, { skip: 0, take: 10 });
      expect(page.records.map((record) => record.fields[category.id])).toEqual([
        "Kitchen",
        "Roof",
        "Kitchen",
      ]);
      expect(published.at(-1)?.kinds).toEqual(
        expect.arrayContaining(["field"])
      );
    });

    it("manages views: update with patch semantics, duplicate with positions, reorder, delete", async () => {
      const { ref, name, status, board } = await boardTable();
      const a = await engine.createRecord(ada, ref, {
        fields: { [name]: "A" },
      });
      const b = await engine.createRecord(ada, ref, {
        fields: { [name]: "B" },
      });
      await engine.moveRecords(ada, ref, {
        viewId: board,
        recordIds: [b.id],
        anchorId: a.id,
        position: "before",
      });

      const updated = await engine.updateView(ada, ref, board, {
        name: "Kanban",
        options: { isEmptyStackHidden: true, stackFieldId: null },
        columnMeta: { [status]: { visible: true } },
      });
      expect(updated.name).toBe("Kanban");
      expect(updated.options).toEqual({ isEmptyStackHidden: true });
      expect(updated.columnMeta[status]).toMatchObject({
        visible: true,
        order: 1,
      });

      const copy = await engine.duplicateView(ada, ref, board);
      expect(copy.name).toBe("Kanban 2");
      const inCopy = await engine.listRecords(ada, ref, {
        viewId: copy.id,
        skip: 0,
        take: 10,
      });
      expect(inCopy.records.map((record) => record.fields[name])).toEqual([
        "B",
        "A",
      ]);

      const reordered = await engine.reorderView(ada, ref, copy.id, {
        anchorId: board,
        position: "before",
      });
      expect(reordered.map((view) => view.id)).toEqual([copy.id, board]);

      await engine.deleteView(ada, ref, board);
      await expect(engine.deleteView(ada, ref, copy.id)).rejects.toMatchObject({
        status: 400,
      });
    });

    it("duplicates and deletes fields, cleaning the views", async () => {
      const { ref, name, status, board } = await boardTable();
      await engine.createRecord(ada, ref, {
        fields: { [name]: "A", [status]: "Done" },
      });
      const copy = await engine.duplicateField(ada, ref, status, {
        viewId: board,
      });
      expect(copy.name).toBe("Status 2");
      const [record] = (
        await engine.listRecords(ada, ref, { skip: 0, take: 1 })
      ).records;
      expect(record.fields[copy.id]).toBe("Done");

      await engine.deleteField(ada, ref, status);
      const schema = await engine.getSchema(ada, ref);
      expect(schema.fields.map((field) => field.id)).toEqual([name, copy.id]);
      expect(schema.views[0].options.stackFieldId).toBeUndefined();
      expect(schema.views[0].columnMeta[status]).toBeUndefined();
      await expect(engine.deleteField(ada, ref, name)).rejects.toMatchObject({
        status: 400,
      });
    });

    it("stores an uploaded file in an attachment cell", async () => {
      const file: DatabaseAttachmentValue = {
        id: "att-1",
        name: "plan.pdf",
        mimetype: "application/pdf",
        size: 12,
        url: "/api/attachments.redirect?id=att-1",
      };
      const storeFile = vi.fn().mockResolvedValue(file);
      engine = engineWith({ attachments: { store: storeFile } });
      const { ref, name } = await boardTable();
      const files = await engine.createField(ada, ref, {
        name: "Files",
        type: DatabaseFieldType.Attachment,
      });
      const record = await engine.createRecord(ada, ref, {
        fields: { [name]: "A" },
      });

      const updated = await engine.uploadAttachment(ada, ref, {
        recordId: record.id,
        fieldId: files.id,
        filePath: "/tmp/plan.pdf",
        fileName: "plan.pdf",
        mimeType: "application/pdf",
      });

      expect(storeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId,
          userId: ada.outlineUserId,
          fileName: "plan.pdf",
        })
      );
      expect(updated.fields[files.id]).toEqual([file]);
    });
  });

  it("computes a base once per version of its tables", async () => {
    const { ref, name } = await boardTable();
    await engine.createRecord(ada, ref, { fields: { [name]: "A" } });
    const computeBase = vi.spyOn(outlineQuery, "computeBase");
    try {
      await engine.listRecords(ada, ref, { skip: 0, take: 1 });
      await engine.listRecords(ada, ref, { skip: 1, take: 1 });
      await engine.getRecord(
        ada,
        ref,
        (await engine.listRecords(ada, ref, { skip: 0, take: 1 })).records[0].id
      );
      expect(computeBase).not.toHaveBeenCalled();

      await engine.createRecord(ada, ref, { fields: { [name]: "B" } });
      expect(computeBase).toHaveBeenCalledTimes(1);
    } finally {
      computeBase.mockRestore();
    }
  });

  it("does not read a table of another team", async () => {
    const { ref } = await boardTable();
    const stranger = new OutlineEngine({
      store,
      query: outlineQuery,
      users,
      attachments: { store: () => Promise.reject(new Error("no files")) },
      publish: async () => undefined,
      computedBases: new ComputedBaseCache(),
      teamId: (await buildTeam()).id,
    });
    await expect(stranger.getSchema(ada, ref)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      stranger.listRecords(ada, ref, { skip: 0, take: 1 })
    ).rejects.toMatchObject({ status: 404 });
  });

  describe("MGE-like linked tables", () => {
    async function linkedTables() {
      const baseId = await engine.createBase("MGE");
      const projects = await engine.createTable(ada, baseId, {
        name: "Projects",
        fields: [
          { key: "name", name: "Name", type: DatabaseFieldType.SingleLineText },
        ],
        view: { name: "Grid", layout: DatabaseLayout.Table },
      });
      const tasks = await engine.createTable(ada, baseId, {
        name: "Tasks",
        fields: [
          { key: "name", name: "Name", type: DatabaseFieldType.SingleLineText },
          { key: "hours", name: "Hours", type: DatabaseFieldType.Number },
        ],
        view: { name: "Grid", layout: DatabaseLayout.Table },
      });
      const projectsRef = {
        externalBaseId: baseId,
        externalTableId: projects.externalTableId,
      };
      const tasksRef = {
        externalBaseId: baseId,
        externalTableId: tasks.externalTableId,
      };

      const project = await engine.createField(ada, tasksRef, {
        name: "Project",
        type: DatabaseFieldType.Link,
        options: {
          foreignTableId: projects.externalTableId,
          relationship: "manyOne",
        },
      });
      const cost = await engine.createField(ada, tasksRef, {
        name: "Cost",
        type: DatabaseFieldType.Formula,
        options: { expression: `{${tasks.fieldIds.hours}} * 100` },
      });
      const symmetricId = project.options.symmetricFieldId ?? "";

      // Rollups come from Teable (the app cannot create them): stored as moved.
      const total = generateEngineId("fld");
      await store.apply(
        [
          {
            tableId: projects.externalTableId,
            fields: {
              upsert: [
                {
                  id: total,
                  tableId: projects.externalTableId,
                  name: "Total",
                  type: DatabaseFieldType.Rollup,
                  description: null,
                  options: { expression: "sum({values})" },
                  lookupOptions: {
                    foreignTableId: tasks.externalTableId,
                    linkFieldId: symmetricId,
                    lookupFieldId: cost.id,
                  },
                  isPrimary: false,
                  isComputed: true,
                  isLookup: false,
                  cellValueType: "number",
                  isMultipleCellValue: false,
                  order: 10,
                },
              ],
            },
          },
        ],
        null,
        new Date()
      );
      return {
        baseId,
        projectsRef,
        tasksRef,
        projectName: projects.fieldIds.name,
        taskName: tasks.fieldIds.name,
        hours: tasks.fieldIds.hours,
        project,
        symmetricId,
        cost,
        total,
      };
    }

    it("keeps symmetric links and recomputes a rollup over a formula of the other table", async () => {
      const t = await linkedTables();
      expect(t.cost.cellValueType).toBe("number");
      const symmetric = (
        await engine.getSchema(ada, t.projectsRef)
      ).fields.find((field) => field.id === t.symmetricId);
      expect(symmetric).toMatchObject({
        name: "Tasks",
        type: DatabaseFieldType.Link,
        options: { relationship: "oneMany", symmetricFieldId: t.project.id },
      });

      const p1 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P1" },
      });
      const p2 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P2" },
      });
      const t1 = await engine.createRecord(ada, t.tasksRef, {
        fields: {
          [t.taskName]: "T1",
          [t.hours]: 2,
          [t.project.id]: [{ id: p1.id }],
        },
      });
      const t2 = await engine.createRecord(ada, t.tasksRef, {
        fields: {
          [t.taskName]: "T2",
          [t.hours]: 3,
          [t.project.id]: [{ id: p1.id }],
        },
      });

      let project = await engine.getRecord(ada, t.projectsRef, p1.id);
      expect(linkedIds(project.fields[t.symmetricId])).toEqual([t1.id, t2.id]);
      expect(project.fields[t.total]).toBe(500);

      published.length = 0;
      await engine.updateRecord(ada, t.tasksRef, t1.id, {
        fields: { [t.hours]: 5 },
      });
      project = await engine.getRecord(ada, t.projectsRef, p1.id);
      expect(project.fields[t.total]).toBe(800);
      const projectChange = published.find(
        (change) => change.tableId === t.projectsRef.externalTableId
      );
      expect(projectChange?.kinds).toEqual(["record.update"]);
      expect(projectChange?.changes).toContainEqual({
        recordId: p1.id,
        fieldId: t.total,
        before: 500,
        after: 800,
      });

      await engine.updateRecord(ada, t.tasksRef, t2.id, {
        fields: { [t.project.id]: [{ id: p2.id }] },
      });
      project = await engine.getRecord(ada, t.projectsRef, p1.id);
      expect(linkedIds(project.fields[t.symmetricId])).toEqual([t1.id]);
      expect(project.fields[t.total]).toBe(500);
      const other = await engine.getRecord(ada, t.projectsRef, p2.id);
      expect(linkedIds(other.fields[t.symmetricId])).toEqual([t2.id]);

      const history = await engine.recordHistory(ada, t.projectsRef, p1.id);
      expect(history.entries[0]).toMatchObject({
        fieldId: t.symmetricId,
        before: [
          { id: t1.id, title: "T1" },
          { id: t2.id, title: "T2" },
        ],
        after: [{ id: t1.id, title: "T1" }],
      });
    });

    it("writes the symmetric side when a project takes a task another one had", async () => {
      const t = await linkedTables();
      const p1 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P1" },
      });
      const p2 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P2" },
      });
      const task = await engine.createRecord(ada, t.tasksRef, {
        fields: { [t.taskName]: "T", [t.project.id]: [{ id: p1.id }] },
      });

      await engine.updateRecord(ada, t.projectsRef, p2.id, {
        fields: { [t.symmetricId]: [{ id: task.id }] },
      });

      expect(
        linkedIds(
          (await engine.getRecord(ada, t.tasksRef, task.id)).fields[
            t.project.id
          ]
        )
      ).toEqual([p2.id]);
      expect(
        (await engine.getRecord(ada, t.projectsRef, p1.id)).fields[
          t.symmetricId
        ]
      ).toBeUndefined();
      const candidates = await engine.linkCandidates(ada, t.projectsRef, {
        fieldId: t.symmetricId,
        recordId: p1.id,
        skip: 0,
        take: 10,
      });
      expect(candidates).toEqual([]);
    });

    it("removes deleted records from the links pointing at them", async () => {
      const t = await linkedTables();
      const p1 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P1" },
      });
      const task = await engine.createRecord(ada, t.tasksRef, {
        fields: { [t.taskName]: "T", [t.project.id]: [{ id: p1.id }] },
      });

      published.length = 0;
      await engine.deleteRecords(ada, t.projectsRef, [p1.id]);

      expect(
        (await engine.getRecord(ada, t.tasksRef, task.id)).fields[t.project.id]
      ).toBeUndefined();
      await expect(
        engine.getRecord(ada, t.projectsRef, p1.id)
      ).rejects.toMatchObject({ status: 404 });
      expect(
        published.find(
          (change) => change.tableId === t.projectsRef.externalTableId
        )
      ).toMatchObject({
        kinds: ["record.delete"],
        recordIds: [p1.id],
      });
      const taskChange = published.find(
        (change) => change.tableId === t.tasksRef.externalTableId
      );
      expect(taskChange?.kinds).toEqual(["record.update"]);
      expect(taskChange?.changes).toContainEqual({
        recordId: task.id,
        fieldId: t.project.id,
        before: { id: p1.id, title: "P1" },
        after: null,
      });
    });

    it("deletes a link with its symmetric field", async () => {
      const t = await linkedTables();
      await engine.deleteField(ada, t.tasksRef, t.project.id);
      const projects = await engine.getSchema(ada, t.projectsRef);
      expect(projects.fields.map((field) => field.id)).not.toContain(
        t.symmetricId
      );
    });

    it("duplicates two linked tables, linked to each other, with their records", async () => {
      const t = await linkedTables();
      const p1 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P1" },
      });
      await engine.createRecord(ada, t.tasksRef, {
        fields: {
          [t.taskName]: "T1",
          [t.hours]: 1,
          [t.project.id]: [{ id: p1.id }],
        },
      });

      const [projectsCopy, tasksCopy] = await new OutlineTablesDuplicator(
        store,
        teamId
      ).duplicateTables(ada, {
        externalBaseId: t.baseId,
        tables: [
          {
            externalTableId: t.projectsRef.externalTableId,
            name: "Projects copy",
          },
          { externalTableId: t.tasksRef.externalTableId, name: "Tasks copy" },
        ],
        withRecords: true,
      });

      const copiedProjects = {
        externalBaseId: t.baseId,
        externalTableId: projectsCopy.externalTableId,
      };
      const copiedTasks = {
        externalBaseId: t.baseId,
        externalTableId: tasksCopy.externalTableId,
      };
      const [project] = (
        await engine.listRecords(ada, copiedProjects, { skip: 0, take: 10 })
      ).records;
      const [task] = (
        await engine.listRecords(ada, copiedTasks, { skip: 0, take: 10 })
      ).records;
      expect(project.id).not.toBe(p1.id);
      expect(projectsCopy.recordIds).toEqual({ [p1.id]: project.id });
      expect(project.fields[projectsCopy.fieldIds[t.total]]).toBe(100);
      expect(linkedIds(task.fields[tasksCopy.fieldIds[t.project.id]])).toEqual([
        project.id,
      ]);
      expect(
        linkedIds(project.fields[projectsCopy.fieldIds[t.symmetricId]])
      ).toEqual([task.id]);

      const copiedLink = (await engine.getSchema(ada, copiedTasks)).fields.find(
        (field) => field.id === tasksCopy.fieldIds[t.project.id]
      );
      expect(copiedLink?.options).toMatchObject({
        foreignTableId: projectsCopy.externalTableId,
        symmetricFieldId: projectsCopy.fieldIds[t.symmetricId],
      });
      expect(
        linkedIds(
          (await engine.getRecord(ada, t.projectsRef, p1.id)).fields[
            t.symmetricId
          ]
        )
      ).toHaveLength(1);
    });

    it("turns text into links by the titles of the linked records", async () => {
      const t = await linkedTables();
      const p1 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "Roof" },
      });
      const p2 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "Kitchen" },
      });
      const label = await engine.createField(ada, t.tasksRef, {
        name: "Label",
        type: DatabaseFieldType.SingleLineText,
      });
      const task = await engine.createRecord(ada, t.tasksRef, {
        fields: { [t.taskName]: "T", [label.id]: "Roof, Kitchen, Garden" },
      });

      const converted = await engine.convertField(ada, t.tasksRef, label.id, {
        type: DatabaseFieldType.Link,
        options: {
          foreignTableId: t.projectsRef.externalTableId,
          relationship: "manyMany",
        },
      });

      const record = await engine.getRecord(ada, t.tasksRef, task.id);
      expect(linkedIds(record.fields[label.id])).toEqual([p1.id, p2.id]);
      const symmetricId = converted.options.symmetricFieldId ?? "";
      expect(
        linkedIds(
          (await engine.getRecord(ada, t.projectsRef, p2.id)).fields[
            symmetricId
          ]
        )
      ).toEqual([task.id]);
    });

    it("changes a relationship, keeping one record where the link now holds one", async () => {
      const t = await linkedTables();
      const p1 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P1" },
      });
      const p2 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P2" },
      });
      const many = await engine.convertField(ada, t.tasksRef, t.project.id, {
        type: DatabaseFieldType.Link,
        options: { relationship: "manyMany" },
      });
      expect(many.isMultipleCellValue).toBe(true);
      const task = await engine.createRecord(ada, t.tasksRef, {
        fields: {
          [t.taskName]: "T",
          [t.project.id]: [{ id: p1.id }, { id: p2.id }],
        },
      });

      const single = await engine.convertField(ada, t.tasksRef, t.project.id, {
        type: DatabaseFieldType.Link,
        options: { relationship: "manyOne" },
      });

      expect(single.isMultipleCellValue).toBe(false);
      expect(
        linkedIds(
          (await engine.getRecord(ada, t.tasksRef, task.id)).fields[
            t.project.id
          ]
        )
      ).toEqual([p1.id]);
      expect(
        (await engine.getRecord(ada, t.projectsRef, p2.id)).fields[
          t.symmetricId
        ]
      ).toBeUndefined();
    });

    it("links to a table of another base", async () => {
      const t = await linkedTables();
      const other = await boardTable();
      const field = await engine.createField(ada, other.ref, {
        name: "Project",
        type: DatabaseFieldType.Link,
        options: {
          foreignTableId: t.projectsRef.externalTableId,
          baseId: t.baseId,
        },
      });
      const p1 = await engine.createRecord(ada, t.projectsRef, {
        fields: { [t.projectName]: "P1" },
      });
      const card = await engine.createRecord(ada, other.ref, {
        fields: { [other.name]: "Card", [field.id]: [{ id: p1.id }] },
      });

      expect(
        (await engine.getRecord(ada, other.ref, card.id)).fields[field.id]
      ).toEqual([{ id: p1.id, title: "P1" }]);
      expect(
        linkedIds(
          (await engine.getRecord(ada, t.projectsRef, p1.id)).fields[
            field.options.symmetricFieldId ?? ""
          ]
        )
      ).toEqual([card.id]);
    });

    it("makes a copied link to a table left out one-way", async () => {
      const t = await linkedTables();
      const [tasksCopy] = await new OutlineTablesDuplicator(
        store,
        teamId
      ).duplicateTables(ada, {
        externalBaseId: t.baseId,
        tables: [
          { externalTableId: t.tasksRef.externalTableId, name: "Tasks copy" },
        ],
        withRecords: false,
      });
      const copiedLink = (
        await engine.getSchema(ada, {
          externalBaseId: t.baseId,
          externalTableId: tasksCopy.externalTableId,
        })
      ).fields.find((field) => field.id === tasksCopy.fieldIds[t.project.id]);
      expect(copiedLink?.options).toMatchObject({
        foreignTableId: t.projectsRef.externalTableId,
        isOneWay: true,
      });
      expect(copiedLink?.options.symmetricFieldId).toBeUndefined();
    });
  });
});

function linkedIds(value: DatabaseCellValue | undefined): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string"
      ? [item.id]
      : []
  );
}

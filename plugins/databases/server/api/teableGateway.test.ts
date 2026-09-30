import { buildAdmin, buildUser } from "@server/test/factories";
import { getTestServer } from "@server/test/support";

const server = getTestServer();
const api = "/api/teable/api";

describe("teable gateway", () => {
  it("is for admins only", async () => {
    const user = await buildUser();
    const res = await server.post(`${api}/base`, user, {
      body: { spaceId: "spc", name: "Projet" },
    });
    expect(res.status).toEqual(403);
  });

  it("builds a base the way the Notion migration tools build a Teable one", async () => {
    const admin = await buildAdmin();
    const call = async (
      method: "get" | "post" | "put" | "patch",
      path: string,
      body?: unknown
    ) => {
      const res = await server[method](`${api}${path}`, admin, { body });
      const text = await res.text();
      expect([res.status, text.slice(0, 300)]).toEqual([
        200,
        expect.any(String),
      ]);
      return JSON.parse(text);
    };

    const base = await call("post", "/base", {
      spaceId: "spc",
      name: "Projet",
    });
    expect(base.id).toMatch(/^bse/);
    const tasks = await call("post", `/base/${base.id}/table`, {
      name: "Tâches",
      fields: [
        { name: "Nom", type: "singleLineText" },
        {
          name: "Statut",
          type: "singleSelect",
          options: { choices: [{ name: "À faire", color: "grayLight2" }] },
        },
        { name: "Points", type: "number" },
        { name: "Dev", type: "user", options: { isMultiple: false } },
      ],
      records: [],
    });
    const sprints = await call("post", `/base/${base.id}/table`, {
      name: "Sprints",
      fields: [{ name: "Nom", type: "singleLineText" }],
    });
    const tables = await call("get", `/base/${base.id}/table`);
    expect(tables.map((t: { name: string }) => t.name).sort()).toEqual([
      "Sprints",
      "Tâches",
    ]);

    const link = await call("post", `/table/${tasks.id}/field`, {
      name: "Sprint",
      type: "link",
      options: {
        relationship: "manyMany",
        foreignTableId: sprints.id,
        isOneWay: false,
      },
    });
    const points = tasks.fields.find(
      (f: { name: string }) => f.name === "Points"
    );
    const total = await call("post", `/table/${sprints.id}/field`, {
      name: "Total",
      type: "rollup",
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: tasks.id,
        linkFieldId: link.options.symmetricFieldId,
        lookupFieldId: points.id,
      },
    });
    expect(total.isComputed).toBe(true);

    const { records: sprintRows } = await call(
      "post",
      `/table/${sprints.id}/record`,
      {
        fieldKeyType: "name",
        typecast: true,
        records: [{ fields: { Nom: "S1" } }],
      }
    );
    const { users } = await call("post", "/galadrim/users/ensure", {
      users: [{ email: "Ada@Example.com", name: "Ada" }],
    });
    expect(users).toEqual([
      { email: "ada@example.com", id: "email:ada@example.com" },
    ]);

    const { records } = await call("post", `/table/${tasks.id}/record`, {
      fieldKeyType: "name",
      typecast: true,
      records: [
        {
          fields: {
            Nom: "A",
            Statut: "En cours",
            Points: "3",
            Dev: { id: users[0].id, title: "Ada", email: "ada@example.com" },
          },
        },
        { fields: { Nom: "B", Statut: "À faire", Points: 5 } },
      ],
    });
    expect(records).toHaveLength(2);
    await call("patch", `/table/${tasks.id}/record`, {
      fieldKeyType: "id",
      records: records.map((r: { id: string }) => ({
        id: r.id,
        fields: { [link.id]: [{ id: sprintRows[0].id }] },
      })),
    });

    const fields = await call("get", `/table/${tasks.id}/field`);
    const statut = fields.find((f: { name: string }) => f.name === "Statut");
    expect(statut.options.choices.map((c: { name: string }) => c.name)).toEqual(
      ["À faire", "En cours"]
    );
    const sprintPage = await call("get", `/table/${sprints.id}/record?take=10`);
    expect(sprintPage.records[0].fields[total.id]).toEqual(8);
    const taskPage = await call("get", `/table/${tasks.id}/record?take=10`);
    const devId = fields.find((f: { name: string }) => f.name === "Dev").id;
    expect(taskPage.records[0].fields[devId]).toMatchObject({
      email: "ada@example.com",
    });

    const board = await call("post", `/table/${tasks.id}/view`, {
      name: "Kanban",
      type: "kanban",
      options: { stackFieldId: statut.id },
      sort: { sortObjs: [{ fieldId: points.id, order: "desc" }] },
    });
    expect(board.sort.sortObjs[0].fieldId).toEqual(points.id);
    await call("put", `/table/${tasks.id}/view/${board.id}/column-meta`, [
      { fieldId: points.id, columnMeta: { hidden: true } },
    ]);
    await call("put", `/table/${tasks.id}/view/${board.id}/sort`, {
      sort: { sortObjs: [], manualSort: true },
    });
    await call("put", `/table/${tasks.id}/view/${board.id}/record-order`, {
      anchorId: records[0].id,
      position: "before",
      recordIds: [records[1].id],
    });
    const ordered = await call(
      "get",
      `/table/${tasks.id}/record?viewId=${board.id}&ignoreViewQuery=true&take=10`
    );
    expect(ordered.records.map((r: { id: string }) => r.id)).toEqual([
      records[1].id,
      records[0].id,
    ]);
    const views = await call("get", `/table/${tasks.id}/view`);
    const saved = views.find((v: { id: string }) => v.id === board.id);
    expect(saved.columnMeta[points.id].hidden).toBe(true);
  });
});

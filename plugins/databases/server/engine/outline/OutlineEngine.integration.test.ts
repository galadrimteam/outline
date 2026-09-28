import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { Event } from "@server/models";
import { buildDatabase, buildUser } from "@server/test/factories";
import { presentDatabaseRecords } from "../../presenters/databaseRecords";
import { actorFor } from "../../utils/actor";
import { DatabaseUserMapper } from "../../utils/DatabaseUserMapper";
import { engineFor, refFor } from "..";

describe("Outline engine through the factory", () => {
  it("stores records in Postgres, tells readers, and lets the routes name people", async () => {
    const user = await buildUser();
    const creator = engineFor({ engine: "outline", teamId: user.teamId });
    const baseId = await creator.createBase("Base");
    const table = await creator.createTable(actorFor(user), baseId, {
      name: "Tasks",
      fields: [
        { key: "name", name: "Name", type: DatabaseFieldType.SingleLineText },
      ],
      view: { name: "Table", layout: DatabaseLayout.Table },
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      engine: "outline",
      externalBaseId: baseId,
      externalTableId: table.externalTableId,
    });
    const engine = engineFor(database, { origin: "tab" });
    const ref = refFor(database);
    const owner = await engine.createField(actorFor(user), ref, {
      name: "Owner",
      type: DatabaseFieldType.User,
    });
    const schedule = vi.spyOn(Event, "schedule");

    const record = await engine.createRecord(actorFor(user), ref, {
      fields: await DatabaseUserMapper.resolveInputs(engine, user.teamId, {
        [table.fieldIds.name]: "Write the plan",
        [owner.id]: { outlineUserId: user.id },
      }),
    });

    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "databases.change",
        modelId: database.id,
        teamId: user.teamId,
        actorId: user.id,
        data: expect.objectContaining({
          kinds: ["record.create"],
          recordIds: [record.id],
          origin: "tab",
        }),
      })
    );
    const [presented] = await presentDatabaseRecords(database, [
      await engine.getRecord(actorFor(user), ref, record.id),
    ]);
    expect(presented.fields[owner.id]).toMatchObject({
      id: user.id,
      title: user.name,
      outlineUserId: user.id,
    });
    const page = await engine.listRecords("system", ref, { skip: 0, take: 10 });
    expect(page.total).toBe(1);
    schedule.mockRestore();
  });
});

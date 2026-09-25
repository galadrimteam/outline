import { vi } from "vitest";
import type { DatabaseUserValue } from "@shared/databases/types";
import { CollectionPermission, NotificationEventType } from "@shared/types";
import { Notification, UserMembership } from "@server/models";
import type { Database, User } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildUser,
} from "@server/test/factories";
import type { DatabaseEvent } from "@server/types";
import { DatabaseRecordAssignedEmail } from "../email/templates/DatabaseRecordAssignedEmail";
import { setEngineFactory } from "../engine";
import { FakeEngine } from "../engine/__mocks__/FakeEngine";
import { DatabaseAssignmentNotificationsProcessor } from "./DatabaseAssignmentNotificationsProcessor";

let engine: FakeEngine;
let actor: User;
let colleague: User;
let database: Database;
let schedule: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  engine = new FakeEngine();
  setEngineFactory(() => engine);
  schedule = vi
    .spyOn(DatabaseRecordAssignedEmail.prototype, "schedule")
    .mockResolvedValue(undefined);
  actor = await buildUser();
  colleague = await buildUser({ teamId: actor.teamId });
  const collection = await buildCollection({
    teamId: actor.teamId,
    userId: actor.id,
  });
  database = await buildDatabase({
    teamId: actor.teamId,
    collectionId: collection.id,
    title: "Suivi",
  });
  engine.addRecord("rec1", { fldName: "Fix login", fldPerson: null });
});

afterEach(() => {
  setEngineFactory();
  vi.restoreAllMocks();
});

function person(user: User, id = `usr-${user.id}`): DatabaseUserValue {
  return { id, title: user.name, email: user.email ?? undefined };
}

function event(
  data: Partial<DatabaseEvent["data"]>,
  actorId = actor.id
): DatabaseEvent {
  return {
    name: "databases.change",
    modelId: database.id,
    teamId: database.teamId,
    actorId,
    collectionId: database.collectionId,
    documentId: null,
    data: { kinds: ["record.update"], origin: "app", ...data },
  };
}

function assigned(before: DatabaseUserValue[], after: DatabaseUserValue[]) {
  return event({
    recordIds: ["rec1"],
    changes: [{ recordId: "rec1", fieldId: "fldPerson", before, after }],
  });
}

async function notificationsOf(user: User) {
  return Notification.unscoped().findAll({
    where: {
      userId: user.id,
      event: NotificationEventType.AddedToDatabaseRecord,
    },
  });
}

describe("DatabaseAssignmentNotificationsProcessor", () => {
  it("only queues row changes made by a member of the team", async () => {
    const shouldQueue = DatabaseAssignmentNotificationsProcessor.shouldQueue;

    expect(await shouldQueue(assigned([], [person(colleague)]))).toBe(true);
    expect(
      await shouldQueue(event({ kinds: ["record.create"], recordIds: ["r"] }))
    ).toBe(true);
    expect(
      await shouldQueue(event({ ...assigned([], []).data, origin: "outline" }))
    ).toBe(false);
    expect(await shouldQueue(event(assigned([], []).data, ""))).toBe(false);
    expect(await shouldQueue(event({ kinds: ["field"] }))).toBe(false);
  });

  it("notifies a colleague added to a person property, in the app and by email", async () => {
    await new DatabaseAssignmentNotificationsProcessor().perform(
      assigned([person(actor)], [person(actor), person(colleague)])
    );

    const [notification] = await notificationsOf(colleague);
    expect(notification).toBeDefined();
    expect(notification.actorId).toEqual(actor.id);
    expect(notification.collectionId).toEqual(database.collectionId);
    expect(notification.documentId).toBeNull();
    expect(notification.data).toEqual({
      databaseId: database.id,
      recordId: "rec1",
      recordTitle: "Fix login",
      databaseTitle: "Suivi",
    });
    expect(await notificationsOf(actor)).toHaveLength(0);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("ignores people who were already there or were removed again", async () => {
    const other = await buildUser({ teamId: actor.teamId });

    await new DatabaseAssignmentNotificationsProcessor().perform(
      event({
        recordIds: ["rec1"],
        changes: [
          {
            recordId: "rec1",
            fieldId: "fldPerson",
            before: [person(colleague)],
            after: [person(colleague), person(other)],
          },
          {
            recordId: "rec1",
            fieldId: "fldPerson",
            before: [person(colleague), person(other)],
            after: [person(colleague)],
          },
        ],
      })
    );

    expect(await notificationsOf(colleague)).toHaveLength(0);
    expect(await notificationsOf(other)).toHaveLength(0);
  });

  it("ignores other fields, strangers and people who opted out", async () => {
    const stranger = await buildUser();
    const optedOut = await buildUser({ teamId: actor.teamId });
    optedOut.setNotificationEventType(
      NotificationEventType.AddedToDatabaseRecord,
      false
    );
    await optedOut.save();

    await new DatabaseAssignmentNotificationsProcessor().perform(
      event({
        recordIds: ["rec1"],
        changes: [
          {
            recordId: "rec1",
            fieldId: "fldName",
            before: null,
            after: [person(colleague)],
          },
          {
            recordId: "rec1",
            fieldId: "fldPerson",
            before: null,
            after: [person(stranger), person(optedOut)],
          },
        ],
      })
    );

    expect(await notificationsOf(colleague)).toHaveLength(0);
    expect(await notificationsOf(stranger)).toHaveLength(0);
    expect(await notificationsOf(optedOut)).toHaveLength(0);
  });

  it("does not notify people who cannot read the database", async () => {
    const collection = await buildCollection({
      teamId: actor.teamId,
      userId: actor.id,
      permission: null,
    });
    await UserMembership.create({
      collectionId: collection.id,
      userId: actor.id,
      permission: CollectionPermission.ReadWrite,
      createdById: actor.id,
    });
    database.collectionId = collection.id;
    await database.save();

    await new DatabaseAssignmentNotificationsProcessor().perform(
      assigned([], [person(colleague)])
    );

    expect(await notificationsOf(colleague)).toHaveLength(0);
  });

  it("notifies the people of a row created with them", async () => {
    engine.addRecord("rec2", {
      fldName: "New card",
      fldPerson: [person(colleague)],
    });

    await new DatabaseAssignmentNotificationsProcessor().perform(
      event({ kinds: ["record.create"], recordIds: ["rec2"] })
    );

    const [notification] = await notificationsOf(colleague);
    expect(notification.data?.recordTitle).toEqual("New card");
  });

  it("finds people without an email by their placeholder address", async () => {
    const noEmail = await buildUser({ teamId: actor.teamId, email: null });

    await new DatabaseAssignmentNotificationsProcessor().perform(
      assigned(
        [],
        [
          {
            id: "usrNoEmail",
            title: noEmail.name,
            email: `${noEmail.id}@users.outline.invalid`,
          },
        ]
      )
    );

    expect(await notificationsOf(noEmail)).toHaveLength(1);
  });

  it("does not repeat an unread notification for the same row", async () => {
    const processor = new DatabaseAssignmentNotificationsProcessor();

    await processor.perform(assigned([], [person(colleague)]));
    await processor.perform(assigned([], [person(colleague)]));

    expect(await notificationsOf(colleague)).toHaveLength(1);
  });

  it("notifies nobody for a bulk change", async () => {
    const recordIds = Array.from({ length: 21 }, (_, index) => `rec${index}`);

    await new DatabaseAssignmentNotificationsProcessor().perform(
      event({
        recordIds,
        changes: recordIds.map((recordId) => ({
          recordId,
          fieldId: "fldPerson",
          before: null,
          after: [person(colleague)],
        })),
      })
    );

    expect(await notificationsOf(colleague)).toHaveLength(0);
  });
});

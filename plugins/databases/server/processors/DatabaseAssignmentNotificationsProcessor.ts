import { subMinutes } from "date-fns";
import { Op } from "sequelize";
import type {
  DatabaseRecord,
  DatabaseUserValue,
} from "@shared/databases/types";
import { NotificationEventType } from "@shared/types";
import { Minute } from "@shared/utils/time";
import Logger from "@server/logging/Logger";
import { Database, Notification, User } from "@server/models";
import { can } from "@server/policies";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { DatabaseEvent, Event } from "@server/types";
import { DatabaseRecordAssignedEmail } from "../email/templates/DatabaseRecordAssignedEmail";
import type { DatabaseEngine, DatabaseRef } from "../engine/DatabaseEngine";
import { engineFor, refFor } from "../engine";
import {
  addedPeople,
  isPersonField,
  outlineUsersOf,
  peopleIn,
} from "../utils/assignments";
import { cellText } from "../utils/cellText";

/** Rows looked at per change; a bulk edit or an import notifies nobody. */
const maxRecords = 20;

/** A second notification for the same row within this delay is dropped. */
const repeatWindowMinutes = 5;

/**
 * Notifies the people someone adds to a person property of a row, in the app
 * and by email, like Notion. Rows created with people in them notify those
 * people too. The author of the change is never notified, nor anyone who
 * cannot read the database; changes Outline made itself and changes by people
 * outside the team are ignored.
 */
export class DatabaseAssignmentNotificationsProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = ["databases.change"];

  /**
   * Only queues row creations and edits made by a member of the team.
   *
   * @param event the event about to be queued.
   * @returns true when someone may have been added to a row.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    if (
      event.name !== "databases.change" ||
      !event.actorId ||
      event.data.origin === "outline"
    ) {
      return false;
    }
    const { kinds, changes, recordIds } = event.data;
    return (
      (kinds.includes("record.update") && !!changes?.length) ||
      (kinds.includes("record.create") && !!recordIds?.length)
    );
  }

  async perform(event: DatabaseEvent) {
    if (!(await DatabaseAssignmentNotificationsProcessor.shouldQueue(event))) {
      return;
    }
    const database = await Database.findByPk(event.modelId);
    if (!database) {
      return;
    }
    const actor = await User.scope("withTeam").findOne({
      where: { id: event.actorId, teamId: database.teamId },
    });
    if (!actor) {
      return;
    }

    const engine = engineFor(database, { origin: "outline" });
    const ref = refFor(database);
    const { fields } = await engine.getSchema("system", ref);
    const personFieldIds = new Set(
      fields.filter(isPersonField).map((field) => field.id)
    );
    if (!personFieldIds.size) {
      return;
    }
    const primary = fields.find((field) => field.isPrimary);

    const added = addedPeople(event.data.changes ?? [], personFieldIds);
    const records = new Map<string, DatabaseRecord>();

    // A batch mixing creations and edits only gives the ids of both, so the
    // people of a created row are only known when the batch holds nothing else.
    if (
      event.data.kinds.includes("record.create") &&
      !event.data.kinds.includes("record.update")
    ) {
      const created = event.data.recordIds ?? [];
      if (created.length > maxRecords) {
        return;
      }
      for (const recordId of created) {
        const record = await fetchRecord(engine, ref, recordId);
        if (record) {
          records.set(record.id, record);
          added.set(record.id, peopleIn(record, personFieldIds));
        }
      }
    }
    if (added.size > maxRecords) {
      return;
    }

    const people = [...added.values()].flat();
    const usersByPersonId = await outlineUsersOf(database.teamId, people);
    const readers = new Map<string, boolean>();

    for (const [recordId, recordPeople] of added) {
      const recipients = uniqueUsers(recordPeople, usersByPersonId).filter(
        (user) =>
          user.id !== actor.id &&
          !user.isSuspended &&
          user.subscribedToEventType(
            NotificationEventType.AddedToDatabaseRecord
          )
      );
      if (!recipients.length) {
        continue;
      }
      const record =
        records.get(recordId) ?? (await fetchRecord(engine, ref, recordId));
      if (!record) {
        continue;
      }
      const recordTitle = primary ? cellText(record.fields[primary.id]) : "";

      for (const recipient of recipients) {
        if (!(await canRead(database, recipient, readers))) {
          continue;
        }
        if (await wasJustNotified(recipient, database.id, recordId)) {
          continue;
        }
        const notification = await Notification.create({
          event: NotificationEventType.AddedToDatabaseRecord,
          userId: recipient.id,
          actorId: actor.id,
          teamId: database.teamId,
          collectionId: database.collectionId,
          data: {
            databaseId: database.id,
            recordId,
            recordTitle,
            databaseTitle: database.title,
          },
        });
        await new DatabaseRecordAssignedEmail(
          {
            to: recipient.email,
            language: recipient.language,
            userId: recipient.id,
            teamUrl: actor.team.url,
            actorName: actor.name,
            databaseId: database.id,
            recordId,
            recordTitle,
            databaseTitle: database.title,
          },
          { notificationId: notification.id }
        ).schedule({ delay: Minute.ms });
      }
    }
  }
}

async function fetchRecord(
  engine: DatabaseEngine,
  ref: DatabaseRef,
  recordId: string
): Promise<DatabaseRecord | null> {
  try {
    return await engine.getRecord("system", ref, recordId);
  } catch (err) {
    Logger.debug("processor", "Row gone before its assignees were notified", {
      recordId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function uniqueUsers(
  people: DatabaseUserValue[],
  usersByPersonId: Map<string, User>
): User[] {
  const users = new Map<string, User>();
  for (const person of people) {
    const user = usersByPersonId.get(person.id);
    if (user) {
      users.set(user.id, user);
    }
  }
  return [...users.values()];
}

async function canRead(
  database: Database,
  user: User,
  cache: Map<string, boolean>
): Promise<boolean> {
  const cached = cache.get(user.id);
  if (cached !== undefined) {
    return cached;
  }
  const anchored = await Database.findByPkForUser(database.id, user.id);
  const result = !!anchored && !!can(user, "read", anchored);
  cache.set(user.id, result);
  return result;
}

async function wasJustNotified(
  user: User,
  databaseId: string,
  recordId: string
): Promise<boolean> {
  const count = await Notification.unscoped().count({
    where: {
      userId: user.id,
      event: NotificationEventType.AddedToDatabaseRecord,
      viewedAt: null,
      createdAt: { [Op.gt]: subMinutes(new Date(), repeatWindowMinutes) },
      data: { databaseId, recordId },
    },
  });
  return count > 0;
}

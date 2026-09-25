import { uniq } from "es-toolkit/compat";
import { DocumentValidation } from "@shared/validations";
import documentUpdater from "@server/commands/documentUpdater";
import { createContext } from "@server/context";
import { Database, Document, User } from "@server/models";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import { sequelize } from "@server/storage/database";
import type { DatabaseEvent, Event } from "@server/types";
import { engineFor, refFor } from "../engine";
import { cellText } from "../utils/cellText";

/**
 * Renames the pages of rows whose primary field changed in the engine, so the
 * page title and the row title stay one. The person who made the change is the
 * author of the rename when they are a member of the team; otherwise the page
 * is renamed without a trace. Changes Outline made itself are skipped.
 */
export class DatabaseChangeTitleProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = ["databases.change"];

  /**
   * Only queues record updates made outside of Outline with changed values.
   *
   * @param event the event about to be queued.
   * @returns true when a row title may have changed.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    return (
      event.name === "databases.change" &&
      event.data.origin !== "outline" &&
      event.data.kinds.includes("record.update") &&
      !!event.data.changes?.length
    );
  }

  async perform(event: DatabaseEvent) {
    const changes = event.data.changes ?? [];
    if (event.data.origin === "outline" || !changes.length) {
      return;
    }
    const database = await Database.findByPk(event.modelId);
    if (!database) {
      return;
    }
    const documents = await Document.findAll({
      where: {
        databaseId: database.id,
        databaseRecordId: uniq(changes.map((change) => change.recordId)),
      },
    });
    if (!documents.length) {
      return;
    }

    const { fields } = await engineFor(database, {
      origin: "outline",
    }).getSchema("system", refFor(database));
    const primary = fields.find((field) => field.isPrimary);
    if (!primary) {
      return;
    }
    const actor = event.actorId
      ? await User.findOne({
          where: { id: event.actorId, teamId: database.teamId },
        })
      : null;

    for (const document of documents) {
      const change = [...changes]
        .reverse()
        .find(
          (item) =>
            item.recordId === document.databaseRecordId &&
            item.fieldId === primary.id
        );
      if (!change) {
        continue;
      }
      const title = cellText(change.after).slice(
        0,
        DocumentValidation.maxTitleLength
      );
      if (title === document.title) {
        continue;
      }

      if (actor) {
        await sequelize.transaction(async (transaction) => {
          await documentUpdater(createContext({ user: actor, transaction }), {
            document,
            title,
          });
        });
      } else {
        document.title = title;
        await document.save({ silent: true });
      }
    }
  }
}

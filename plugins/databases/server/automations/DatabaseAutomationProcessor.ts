import { DatabaseAutomationLimits } from "@shared/databases/automations";
import { Database, DatabaseAutomation } from "@server/models";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { DatabaseEvent, Event } from "@server/types";
import { DatabaseAutomationRunner } from "./DatabaseAutomationRunner";
import { parseAutomationOrigin } from "./origin";
import { triggeredRecordIds } from "./triggers";

/**
 * Runs the automations of a database when its rows are created or changed in
 * the engine. The change's before/after values tell which property changed.
 * An automation ignores the writes it made itself, and a chain of automations
 * writing into one another stops after `maxDepth` runs.
 */
export class DatabaseAutomationProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = ["databases.change"];

  /**
   * Only queues row changes of a database that has enabled automations, and
   * not beyond the depth limit.
   *
   * @param event the event about to be queued.
   * @returns true when an automation may run.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    if (
      event.name !== "databases.change" ||
      !event.data.kinds.some(
        (kind) => kind === "record.create" || kind === "record.update"
      ) ||
      isTooDeep(event.data.origin)
    ) {
      return false;
    }
    const count = await DatabaseAutomation.count({
      where: { databaseId: event.modelId, enabled: true },
    });
    return count > 0;
  }

  constructor(
    private readonly runner: DatabaseAutomationRunner = new DatabaseAutomationRunner()
  ) {
    super();
  }

  async perform(event: DatabaseEvent) {
    if (isTooDeep(event.data.origin)) {
      return;
    }
    const origin = parseAutomationOrigin(event.data.origin);
    const database = await Database.findByPk(event.modelId);
    if (!database) {
      return;
    }
    const automations = await DatabaseAutomation.findAll({
      where: { databaseId: database.id, enabled: true },
      order: [["createdAt", "ASC"]],
    });

    for (const automation of automations) {
      if (origin?.automationId === automation.id) {
        continue;
      }
      const recordIds = triggeredRecordIds(automation.trigger, event.data);
      if (!recordIds.length) {
        continue;
      }
      await this.runner.run(automation, database, {
        recordIds,
        actorId: event.actorId || null,
        depth: (origin?.depth ?? 0) + 1,
      });
    }
  }
}

function isTooDeep(origin: string | null | undefined): boolean {
  const parsed = parseAutomationOrigin(origin);
  return !!parsed && parsed.depth >= DatabaseAutomationLimits.maxDepth;
}

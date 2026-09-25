import type { DatabaseAutomationAction } from "@shared/databases/automations";
import Logger from "@server/logging/Logger";
import type { Database, DatabaseAutomation } from "@server/models";
import { User } from "@server/models";
import { engineFor, refFor } from "../engine";
import { DatabaseUserMapper } from "../utils/DatabaseUserMapper";
import { actorFor } from "../utils/actor";
import { CreateRecordExecutor } from "./actions/CreateRecordExecutor";
import { NotifyExecutor } from "./actions/NotifyExecutor";
import { SetPropertyExecutor } from "./actions/SetPropertyExecutor";
import { SlackExecutor } from "./actions/SlackExecutor";
import type { AutomationExecutors } from "./actions/types";
import { matchesConditions } from "./conditions";
import type { AutomationRunContext } from "./context";
import { formatAutomationOrigin } from "./origin";

/** What started a run. */
export interface AutomationRunRequest {
  /** The rows the trigger fired on. */
  recordIds: string[];
  /** The Outline user behind the change or the click, if any. */
  actorId: string | null;
  /** The depth of this run in a chain of automations, from 1. */
  depth: number;
}

/** What a run did. */
export interface AutomationRunResult {
  /** The rows that matched the conditions and had the actions run. */
  recordIds: string[];
  errors: string[];
}

const maxErrorLength = 2000;

/**
 * Runs an automation on rows: reads each row as the service account, checks
 * the conditions, and runs the actions in order. An action that fails does
 * not stop the next ones; the failures are kept in `lastError` for the
 * editors to see, and nothing is thrown, so that a queue does not retry
 * actions that already ran.
 */
export class DatabaseAutomationRunner {
  constructor(
    private readonly executors: AutomationExecutors = defaultExecutors()
  ) {}

  /**
   * Runs an automation.
   *
   * @param automation the automation.
   * @param database its database.
   * @param request the rows, the actor and the depth.
   * @returns the rows the actions ran on and the errors.
   */
  public async run(
    automation: DatabaseAutomation,
    database: Database,
    request: AutomationRunRequest
  ): Promise<AutomationRunResult> {
    const origin = formatAutomationOrigin(automation.id, request.depth);
    const engine = engineFor(database, { origin });
    const ref = refFor(database);
    const result: AutomationRunResult = { recordIds: [], errors: [] };

    try {
      const [schema, actor, author] = await Promise.all([
        engine.getSchema("system", ref),
        activeMember(request.actorId, database.teamId),
        activeMember(automation.createdById, database.teamId),
      ]);
      const fieldsById = new Map(
        schema.fields.map((field) => [field.id, field])
      );

      for (const recordId of request.recordIds) {
        const record = await engine.getRecord("system", ref, recordId);
        await DatabaseUserMapper.enrich(database.teamId, [record]);
        const now = new Date();
        if (
          automation.conditions &&
          !matchesConditions(automation.conditions, record, {
            fieldsById,
            actorEmail: actor ? actorFor(actor).email : null,
            now,
          })
        ) {
          continue;
        }

        result.recordIds.push(recordId);
        const context: AutomationRunContext = {
          automation,
          database,
          engine,
          engineFor: (other) => engineFor(other, { origin }),
          fields: schema.fields,
          record,
          actor,
          author,
          now,
        };
        for (const action of automation.actions) {
          try {
            await this.execute(action, context);
          } catch (err) {
            result.errors.push(`${action.type}: ${errorMessage(err)}`);
          }
        }
      }
    } catch (err) {
      result.errors.push(errorMessage(err));
    }

    if (result.errors.length) {
      Logger.warn("Database automation failed", {
        automationId: automation.id,
        databaseId: database.id,
        errors: result.errors,
      });
    }
    if (result.recordIds.length || result.errors.length) {
      await automation.update(
        {
          lastRunAt: new Date(),
          lastError: result.errors.length
            ? result.errors.join("\n").slice(0, maxErrorLength)
            : null,
        },
        { silent: true }
      );
    }
    return result;
  }

  private execute(
    action: DatabaseAutomationAction,
    context: AutomationRunContext
  ): Promise<void> {
    switch (action.type) {
      case "setProperty":
        return this.executors.setProperty.execute(action, context);
      case "notify":
        return this.executors.notify.execute(action, context);
      case "slack":
        return this.executors.slack.execute(action, context);
      case "createRecord":
        return this.executors.createRecord.execute(action, context);
      default:
        return Promise.resolve();
    }
  }
}

/**
 * Returns the executors of every kind of action.
 *
 * @returns the default executors.
 */
export function defaultExecutors(): AutomationExecutors {
  return {
    setProperty: new SetPropertyExecutor(),
    notify: new NotifyExecutor(),
    slack: new SlackExecutor(),
    createRecord: new CreateRecordExecutor(),
  };
}

async function activeMember(
  userId: string | null,
  teamId: string
): Promise<User | null> {
  if (!userId) {
    return null;
  }
  return User.findOne({ where: { id: userId, teamId, suspendedAt: null } });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

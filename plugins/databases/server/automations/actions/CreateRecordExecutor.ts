import type { DatabaseCreateRecordAction } from "@shared/databases/automations";
import type { DatabaseCellInput, DatabaseField } from "@shared/databases/types";
import { AuthorizationError, ValidationError } from "@server/errors";
import { Database } from "@server/models";
import { can } from "@server/policies";
import { refFor } from "../../engine";
import { DatabaseUserMapper } from "../../utils/DatabaseUserMapper";
import { isWritableField } from "../cellValues";
import type { AutomationRunContext } from "../context";
import type { AutomationActionExecutor } from "./types";
import { resolveAutomationValue } from "./values";

/**
 * Creates a row in this database or another one of the team. Another
 * database is written only while the automation's author may edit it.
 */
export class CreateRecordExecutor implements AutomationActionExecutor<DatabaseCreateRecordAction> {
  async execute(
    action: DatabaseCreateRecordAction,
    context: AutomationRunContext
  ): Promise<void> {
    const target = await this.target(action.databaseId, context);
    const engine =
      target.id === context.database.id
        ? context.engine
        : context.engineFor(target);
    const ref = refFor(target);
    const fields =
      target.id === context.database.id
        ? context.fields
        : (await engine.getSchema("system", ref)).fields;

    await engine.createRecord("system", ref, {
      fields: await DatabaseUserMapper.resolveInputs(
        engine,
        target.teamId,
        this.cells(action, fields, context)
      ),
    });
  }

  private async target(
    databaseId: string,
    context: AutomationRunContext
  ): Promise<Database> {
    if (databaseId === context.database.id) {
      return context.database;
    }
    const target = await Database.findOne({
      where: { id: databaseId, teamId: context.database.teamId },
    });
    if (!target) {
      throw ValidationError("The database to add a row to was deleted");
    }
    const { author } = context;
    if (!author) {
      throw AuthorizationError(
        "The automation's author left the team: another database cannot be written"
      );
    }
    await target.loadAnchor(author.id);
    if (!can(author, "update", target)) {
      throw AuthorizationError(
        "The automation's author may no longer edit the database to add a row to"
      );
    }
    return target;
  }

  private cells(
    action: DatabaseCreateRecordAction,
    fields: DatabaseField[],
    context: AutomationRunContext
  ): Record<string, DatabaseCellInput> {
    const cells: Record<string, DatabaseCellInput> = {};
    for (const [fieldId, value] of Object.entries(action.fields)) {
      const field = fields.find((item) => item.id === fieldId);
      if (!field || !isWritableField(field)) {
        continue;
      }
      const input = resolveAutomationValue(value, field, context);
      if (input !== undefined) {
        cells[fieldId] = input;
      }
    }
    return cells;
  }
}

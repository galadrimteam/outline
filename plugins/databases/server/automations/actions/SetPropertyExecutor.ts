import type { DatabaseSetPropertyAction } from "@shared/databases/automations";
import { ValidationError } from "@server/errors";
import { refFor } from "../../engine";
import { DatabaseUserMapper } from "../../utils/DatabaseUserMapper";
import { isWritableField } from "../cellValues";
import type { AutomationRunContext } from "../context";
import type { AutomationActionExecutor } from "./types";
import { resolveAutomationValue } from "./values";

/**
 * Writes a property of the row: a value, today's date, the person who made
 * the change, or nothing. Later actions of the run see the new value.
 */
export class SetPropertyExecutor implements AutomationActionExecutor<DatabaseSetPropertyAction> {
  async execute(
    action: DatabaseSetPropertyAction,
    context: AutomationRunContext
  ): Promise<void> {
    const field = context.fields.find((item) => item.id === action.fieldId);
    if (!field || !isWritableField(field)) {
      throw ValidationError("The property to set was deleted or is computed");
    }
    const value = resolveAutomationValue(action.value, field, context);
    if (value === undefined) {
      return;
    }

    const { engine, database, record } = context;
    const updated = await engine.updateRecord(
      "system",
      refFor(database),
      record.id,
      {
        fields: await DatabaseUserMapper.resolveInputs(
          engine,
          database.teamId,
          { [field.id]: value }
        ),
      }
    );
    await DatabaseUserMapper.enrich(database.teamId, [updated]);
    context.record = {
      ...record,
      fields: { ...record.fields, ...updated.fields },
    };
  }
}

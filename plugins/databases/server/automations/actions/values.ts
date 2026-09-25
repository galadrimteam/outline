import type { DatabaseAutomationValue } from "@shared/databases/automations";
import type { DatabaseCellInput, DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { AutomationRunContext } from "../context";
import { templateVariablesFor } from "../context";
import { isMultipleField } from "../cellValues";
import { renderTemplate } from "../templates";

/**
 * Returns the value an action writes into a field.
 *
 * @param value the configured value.
 * @param field the field written.
 * @param context the run.
 * @returns the cell input, or undefined when there is nothing to write (« me »
 * without a person behind the change, a template that is not a number).
 */
export function resolveAutomationValue(
  value: DatabaseAutomationValue,
  field: DatabaseField,
  context: AutomationRunContext
): DatabaseCellInput | undefined {
  switch (value.kind) {
    case "static":
      return value.value;
    case "clear":
      return null;
    case "now":
      return context.now.toISOString();
    case "me": {
      if (!context.actor) {
        return undefined;
      }
      const input = { outlineUserId: context.actor.id };
      return isMultipleField(field) ? [input] : input;
    }
    case "record": {
      const link = { id: context.record.id };
      return isMultipleField(field) ? [link] : link;
    }
    case "template": {
      const text = renderTemplate(value.text, templateVariablesFor(context));
      if (
        field.type === DatabaseFieldType.Number ||
        field.type === DatabaseFieldType.Rating
      ) {
        const number = Number(text.trim().replace(",", "."));
        return text.trim() && Number.isFinite(number) ? number : undefined;
      }
      return text;
    }
    default:
      return undefined;
  }
}

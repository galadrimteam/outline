import type { PresentedDatabaseAutomation } from "@shared/databases/automations";
import type { DatabaseAutomation } from "@server/models";

/**
 * Presents an automation for the API.
 *
 * @param automation the automation.
 * @returns the presented automation.
 */
export function presentDatabaseAutomation(
  automation: DatabaseAutomation
): PresentedDatabaseAutomation {
  return {
    id: automation.id,
    databaseId: automation.databaseId,
    name: automation.name,
    enabled: automation.enabled,
    trigger: automation.trigger,
    conditions: automation.conditions ?? null,
    actions: automation.actions ?? [],
    createdById: automation.createdById,
    lastRunAt: automation.lastRunAt?.toISOString() ?? null,
    lastError: automation.lastError,
    createdAt: automation.createdAt.toISOString(),
    updatedAt: automation.updatedAt.toISOString(),
  };
}

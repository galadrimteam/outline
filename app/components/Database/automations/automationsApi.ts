import type {
  DatabaseAutomationAction,
  DatabaseAutomationTrigger,
  PresentedDatabaseAutomation,
} from "@shared/databases/automations";
import type { DatabaseFilter } from "@shared/databases/types";
import { databaseRpc } from "~/stores/DatabasesStore";

/** An automation being edited, before it is saved. */
export interface AutomationDraft {
  name: string;
  enabled: boolean;
  trigger: DatabaseAutomationTrigger;
  conditions: DatabaseFilter | null;
  actions: DatabaseAutomationAction[];
}

/** What clicking a button did. */
export interface ButtonClickResult {
  /** How many automations ran. */
  ran: number;
  errors: string[];
}

/**
 * Lists the automations of a database.
 *
 * @param databaseId the database.
 * @returns the automations, oldest first.
 */
export async function listAutomations(
  databaseId: string
): Promise<PresentedDatabaseAutomation[]> {
  const res = await databaseRpc<PresentedDatabaseAutomation[]>(
    "/databaseAutomations.list",
    { databaseId }
  );
  return res.data;
}

/**
 * Creates an automation.
 *
 * @param databaseId the database.
 * @param draft the automation.
 * @returns the saved automation.
 */
export async function createAutomation(
  databaseId: string,
  draft: AutomationDraft
): Promise<PresentedDatabaseAutomation> {
  const res = await databaseRpc<PresentedDatabaseAutomation>(
    "/databaseAutomations.create",
    { databaseId, ...draft }
  );
  return res.data;
}

/**
 * Changes an automation.
 *
 * @param id the automation.
 * @param patch the changes.
 * @returns the saved automation.
 */
export async function updateAutomation(
  id: string,
  patch: Partial<AutomationDraft>
): Promise<PresentedDatabaseAutomation> {
  const res = await databaseRpc<PresentedDatabaseAutomation>(
    "/databaseAutomations.update",
    { id, ...patch }
  );
  return res.data;
}

/**
 * Deletes an automation.
 *
 * @param id the automation.
 */
export async function deleteAutomation(id: string): Promise<void> {
  await databaseRpc("/databaseAutomations.delete", { id });
}

/**
 * Clicks a button property of a row: runs the automations of that button.
 *
 * @param databaseId the database.
 * @param recordId the row.
 * @param fieldId the button property.
 * @returns how many automations ran and their errors.
 */
export async function clickDatabaseButton(
  databaseId: string,
  recordId: string,
  fieldId: string
): Promise<ButtonClickResult> {
  const res = await databaseRpc<ButtonClickResult>(
    "/databaseRecords.clickButton",
    { databaseId, recordId, fieldId }
  );
  return res.data;
}

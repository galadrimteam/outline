import { processOutlineStore } from "../engine/outline/processCaches";

/** The engines a table can live in. */
export type TableEngineName = "outline" | "teable";

/**
 * Returns the engine holding a table: the Outline engine when its store has the table for this team, Teable
 * otherwise (the migration built Teable tables first, and builds Outline engine ones since).
 *
 * @param teamId the team of the table.
 * @param tableId the engine table id.
 * @returns the engine name.
 */
export async function engineOfTable(
  teamId: string,
  tableId: string
): Promise<TableEngineName> {
  const snapshot = await processOutlineStore()
    .table(tableId)
    .catch(() => null);
  return snapshot?.table.teamId === teamId ? "outline" : "teable";
}

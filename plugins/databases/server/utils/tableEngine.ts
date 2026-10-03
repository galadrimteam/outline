import { processOutlineStore } from "../engine/outline/processCaches";
import type { OutlineStore } from "../engine/outline/store/OutlineStore";

/** The engines a table can live in. */
export type TableEngineName = "outline" | "teable";

/**
 * Returns the engine holding a table: the Outline engine when its store has the table for this team, Teable
 * otherwise (the migration built Teable tables first, and builds Outline engine ones since).
 *
 * @param teamId the team of the table.
 * @param tableId the engine table id.
 * @param store where the Outline engine keeps its tables.
 * @returns the engine name.
 * @throws when the store cannot be read: the caller retries rather than guess.
 */
export async function engineOfTable(
  teamId: string,
  tableId: string,
  store: Pick<OutlineStore, "tableTeamId"> = processOutlineStore()
): Promise<TableEngineName> {
  // Only the table's row is read: loading its data could time out on a big
  // table, and a failed read must not file an Outline table under Teable.
  return (await store.tableTeamId(tableId)) === teamId ? "outline" : "teable";
}

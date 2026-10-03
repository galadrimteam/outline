import { engineFor } from "../engine";
import type { DatabaseRef } from "../engine/DatabaseEngine";
import type { TableEngineName } from "./tableEngine";

// notion-to-teable.mjs names a second database of the same name inside a project « Points (2) », a third « Points (3) »:
// Notion shows them all as « Points ». A « (1) » is Notion's own, from a duplicated database.
const DuplicateSuffix = / \((?:[2-9]|[1-9]\d+)\)$/;

/**
 * The name Notion shows for a migrated table: its engine name without the
 * suffix the migration gives to a database whose name is already taken.
 *
 * @param engineName the table's name in its engine.
 * @returns the Notion name, null when the table has none.
 */
export function notionDatabaseName(engineName: string | null): string | null {
  const name = engineName?.replace(DuplicateSuffix, "").trim();
  return name || null;
}

/**
 * The name of a table in its engine.
 *
 * @param teamId the team of the table.
 * @param engine the engine holding the table.
 * @param ref the table.
 * @returns the name, null when the table has none or does not exist.
 * @throws when the engine cannot be read: the caller retries rather than guess another name.
 */
export async function engineTableName(
  teamId: string,
  engine: TableEngineName,
  ref: DatabaseRef
): Promise<string | null> {
  try {
    return (
      (await engineFor({ engine, teamId }).describeTable("system", ref)).name ||
      null
    );
  } catch (err) {
    if (isNotFound(err)) {
      return null;
    }
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    err.status === 404
  );
}

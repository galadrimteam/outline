import { toast } from "sonner";
import type {
  DatabaseField,
  DatabaseSelectChoice,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import type Database from "~/models/Database";
import type RootStore from "~/stores/RootStore";

/**
 * Saves new options for a select field (and its status groups), reporting failures.
 *
 * @param stores the root store.
 * @param database the database.
 * @param field the select field.
 * @param choices the new options.
 * @param statusGroups the new status groups, for status fields.
 * @returns the saved field, or undefined when saving failed.
 */
export async function saveChoices(
  stores: RootStore,
  database: Database,
  field: DatabaseField,
  choices: DatabaseSelectChoice[],
  statusGroups?: Record<string, DatabaseStatusGroup>
): Promise<DatabaseField | undefined> {
  try {
    const saved = await stores.databases.convertField(
      database.id,
      field.id,
      field.type,
      { ...field.options, choices }
    );
    if (statusGroups) {
      await stores.databases.update(database.id, {
        settings: {
          fieldMeta: { [field.id]: { ...field.meta, statusGroups } },
        },
      });
      await stores.databases.fetch(database.id, { force: true });
    }
    return saved;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

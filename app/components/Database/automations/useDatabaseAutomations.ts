import * as React from "react";
import type { PresentedDatabaseAutomation } from "@shared/databases/automations";
import type { AutomationDraft } from "./automationsApi";
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  updateAutomation,
} from "./automationsApi";

/** The automations of a database and what can be done with them. */
export interface DatabaseAutomations {
  /** The automations, undefined while loading. */
  automations: PresentedDatabaseAutomation[] | undefined;
  /** Why they could not be loaded. */
  error: Error | undefined;
  /** Loads them again. */
  reload: () => void;
  /** Creates an automation, or changes one when an id is given. */
  save: (
    id: string | undefined,
    draft: AutomationDraft
  ) => Promise<PresentedDatabaseAutomation>;
  /** Turns an automation on or off, at once, restored when refused. */
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Loads the automations of a database for its editors.
 *
 * @param databaseId the database.
 * @returns the automations and their actions.
 */
export function useDatabaseAutomations(
  databaseId: string
): DatabaseAutomations {
  const [automations, setAutomations] =
    React.useState<PresentedDatabaseAutomation[]>();
  const [error, setError] = React.useState<Error>();

  const load = React.useCallback(
    () =>
      listAutomations(databaseId)
        .then((items) => {
          setAutomations(items);
          setError(undefined);
        })
        .catch((err: Error) => setError(err)),
    [databaseId]
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const reload = React.useCallback(() => {
    setError(undefined);
    void load();
  }, [load]);

  const replace = React.useCallback(
    (saved: PresentedDatabaseAutomation) =>
      setAutomations((current = []) =>
        current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved]
      ),
    []
  );

  const save = React.useCallback(
    async (id: string | undefined, draft: AutomationDraft) => {
      const saved = id
        ? await updateAutomation(id, draft)
        : await createAutomation(databaseId, draft);
      replace(saved);
      return saved;
    },
    [databaseId, replace]
  );

  const setEnabled = React.useCallback(
    async (id: string, enabled: boolean) => {
      const toggle = (value: boolean) =>
        setAutomations((current) =>
          current?.map((item) =>
            item.id === id ? { ...item, enabled: value } : item
          )
        );
      toggle(enabled);
      try {
        replace(await updateAutomation(id, { enabled }));
      } catch (err) {
        toggle(!enabled);
        throw err;
      }
    },
    [replace]
  );

  const remove = React.useCallback(async (id: string) => {
    await deleteAutomation(id);
    setAutomations((current) => current?.filter((item) => item.id !== id));
  }, []);

  return { automations, error, reload, save, setEnabled, remove };
}

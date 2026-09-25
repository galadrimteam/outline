import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  DatabaseColumnMeta,
  DatabaseFilter,
  DatabaseGroup,
  DatabaseSort,
  DatabaseView,
  DatabaseViewOptions,
  DatabaseViewOverrides,
} from "@shared/databases/types";
import useStores from "~/hooks/useStores";

/** What `stores.databases.updateView` accepts; nested objects are merged one level deep by the server. */
export interface DatabaseViewPatch {
  name?: string;
  filter?: DatabaseFilter | null;
  sort?: DatabaseSort | null;
  group?: DatabaseGroup | null;
  columnMeta?: Record<string, Partial<DatabaseColumnMeta>>;
  options?: Partial<DatabaseViewOptions>;
  overrides?: Partial<DatabaseViewOverrides>;
  isLocked?: boolean;
}

/**
 * Returns a function saving changes to a view for everyone, with an error
 * toast when the server refuses them (the store rolls the view back).
 *
 * @param databaseId the database id.
 * @param view the view to update.
 * @returns the update function.
 */
export function useViewUpdate(databaseId: string, view: DatabaseView) {
  const { databases } = useStores();
  const { t } = useTranslation();

  return React.useCallback(
    async (patch: DatabaseViewPatch) => {
      try {
        await databases.updateView(databaseId, view.id, patch);
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t("The view could not be saved")
        );
        return false;
      }
    },
    [databases, databaseId, view.id, t]
  );
}

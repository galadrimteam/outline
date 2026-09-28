import type { DatabaseLayout } from "@shared/databases/types";

/** What a database block inserted in this tab, still without a database, is waiting for. */
export type PendingDatabase =
  | {
      kind: "create";
      layout: DatabaseLayout;
      /** Set once the creation request is sent, so that a remount does not send it twice. */
      request?: Promise<string>;
    }
  | { kind: "link" };

/**
 * Database blocks inserted from the block menu, by block id. The node only
 * carries ids, so what to do with an empty block lives here, for the tab that
 * inserted it: other readers see the block once it points at a database.
 */
export const pendingDatabases = new Map<string, PendingDatabase>();

import { uniq } from "es-toolkit/compat";
import type { DatabaseChangeKind } from "@shared/databases/types";
import { toError } from "@shared/utils/error";
import Logger from "@server/logging/Logger";
import type { DatabaseChange } from "../../utils/DatabaseChangePublisher";
import type { DatabaseActor } from "../DatabaseEngine";
import { computedChanges } from "./changes";
import type { ReadState } from "./TableReader";
import type { WriteBatchTableSummary } from "./WriteBatch";

/**
 * Tells the readers of each table a write changed what changed, as the
 * Teable webhook does: created, updated and deleted records, the before and
 * after of every changed cell (computed ones included, in the tables that
 * read the written ones too), changed fields and views, who made the change
 * and the origin the engine was built with. A failure to tell is logged, the
 * write stands.
 */
export class ChangeNotifier {
  /**
   * @param publish sends a table's change to its readers.
   * @param origin echoed to the readers, so that a writer knows its own changes.
   */
  constructor(
    private readonly publish: (change: DatabaseChange) => Promise<void>,
    private readonly origin: string | null
  ) {}

  /**
   * Publishes the changes of a write.
   *
   * @param actor who wrote.
   * @param before the read before the write.
   * @param after the read after the write.
   * @param summaries what the write changed in each table.
   */
  public async notify(
    actor: DatabaseActor,
    before: ReadState,
    after: ReadState,
    summaries: WriteBatchTableSummary[]
  ) {
    const diffs = computedChanges(before, after, summaries);
    const tableIds = uniq([
      ...summaries.map((summary) => summary.tableId),
      ...diffs.map((diff) => diff.tableId),
    ]);
    for (const tableId of tableIds) {
      const summary = summaries.find((item) => item.tableId === tableId);
      const diff = diffs.find((item) => item.tableId === tableId);
      const created = uniq([
        ...(summary?.created ?? []),
        ...(diff?.created ?? []),
      ]);
      const deleted = uniq([
        ...(summary?.deleted ?? []),
        ...(diff?.deleted ?? []),
      ]);
      const gone = new Set([...created, ...deleted]);
      const updated = uniq([
        ...(diff?.updated ?? []),
        ...(summary?.updated ?? []),
      ]).filter((id) => !gone.has(id));
      const changes = (diff?.changes ?? []).filter(
        (change) => !gone.has(change.recordId)
      );

      const kinds: DatabaseChangeKind[] = [];
      if (created.length) {
        kinds.push("record.create");
      }
      if (updated.length) {
        kinds.push("record.update");
      }
      if (deleted.length) {
        kinds.push("record.delete");
      }
      if (summary?.fieldIds.length) {
        kinds.push("field");
      }
      if (summary?.viewIds.length) {
        kinds.push("view");
      }
      if (!kinds.length) {
        continue;
      }

      try {
        await this.publish({
          tableId,
          kinds,
          recordIds: [...created, ...updated, ...deleted],
          fieldIds: uniq([
            ...(summary?.fieldIds ?? []),
            ...changes.map((change) => change.fieldId),
          ]),
          viewIds: summary?.viewIds ?? [],
          changes,
          actor:
            actor === "system" ? null : { outlineUserId: actor.outlineUserId },
          origin: this.origin,
        });
      } catch (err) {
        Logger.warn("Could not tell the readers of a database table", {
          tableId,
          error: toError(err).message,
        });
      }
    }
  }
}

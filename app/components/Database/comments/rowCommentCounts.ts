import { chunk } from "es-toolkit/compat";
import { action, makeObservable, observable } from "mobx";
import { client } from "~/utils/ApiClient";
import Logger from "~/utils/Logger";

/** Rows per request, the route's limit. */
const batchSize = 200;

/** Cards asking within this delay share a request. */
const batchDelay = 50;

/** A count older than this is asked again when a card shows it. */
const maxAge = 60 * 1000;

/**
 * The open comment counts of row pages. Cards ask for their row one by one;
 * the rows asked for in the same moment are loaded in one request per
 * database, and a count is reused for a minute.
 */
export class RowCommentCounts {
  constructor() {
    makeObservable(this);
  }

  /**
   * Returns the count of a row; observable.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   * @returns the count, undefined until loaded.
   */
  get(databaseId: string, recordId: string): number | undefined {
    return this.counts.get(key(databaseId, recordId));
  }

  /**
   * Asks for the count of a row, loaded with the other rows asked for now.
   *
   * @param databaseId the database id.
   * @param recordId the row id.
   */
  request(databaseId: string, recordId: string) {
    const fetchedAt = this.fetchedAt.get(key(databaseId, recordId));
    if (fetchedAt !== undefined && Date.now() - fetchedAt < maxAge) {
      return;
    }
    const pending = this.pending.get(databaseId) ?? new Set<string>();
    pending.add(recordId);
    this.pending.set(databaseId, pending);
    this.timer ??= setTimeout(() => void this.flush(), batchDelay);
  }

  /**
   * Forgets when counts were loaded, so that they are asked again, eg after a
   * comment was added.
   *
   * @param databaseId only the rows of this database.
   */
  invalidate(databaseId?: string) {
    if (!databaseId) {
      this.fetchedAt.clear();
      return;
    }
    for (const entry of this.fetchedAt.keys()) {
      if (entry.startsWith(`${databaseId}:`)) {
        this.fetchedAt.delete(entry);
      }
    }
  }

  @observable.shallow
  private counts = new Map<string, number>();

  private fetchedAt = new Map<string, number>();

  private pending = new Map<string, Set<string>>();

  private timer: ReturnType<typeof setTimeout> | undefined;

  private async flush() {
    const pending = this.pending;
    this.pending = new Map();
    this.timer = undefined;

    await Promise.all(
      [...pending].flatMap(([databaseId, recordIds]) =>
        chunk([...recordIds], batchSize).map((ids) =>
          this.load(databaseId, ids)
        )
      )
    );
  }

  private async load(databaseId: string, recordIds: string[]) {
    const now = Date.now();
    recordIds.forEach((id) => this.fetchedAt.set(key(databaseId, id), now));
    try {
      const res = await client.post<{ data: Record<string, number> }>(
        "/databaseRecords.commentCounts",
        { databaseId, recordIds }
      );
      this.store(databaseId, res.data);
    } catch (err) {
      recordIds.forEach((id) => this.fetchedAt.delete(key(databaseId, id)));
      Logger.warn("Failed to load row comment counts", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  @action
  private store(databaseId: string, counts: Record<string, number>) {
    for (const [recordId, count] of Object.entries(counts)) {
      this.counts.set(key(databaseId, recordId), count);
    }
  }
}

/** The counts shared by every card on screen. */
export const rowCommentCounts = new RowCommentCounts();

function key(databaseId: string, recordId: string) {
  return `${databaseId}:${recordId}`;
}

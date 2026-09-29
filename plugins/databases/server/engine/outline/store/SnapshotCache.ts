import type { TableSnapshot } from "../types";

/**
 * The tables a process has read, least recently used evicted first once the
 * cache holds too many tables or too many records in total. A snapshot is
 * only served while its version is the table's current one.
 */
export class SnapshotCache {
  /**
   * @param maxTables how many tables to keep at most.
   * @param maxRecords how many records to keep at most, all tables together.
   */
  constructor(
    private readonly maxTables = 200,
    private readonly maxRecords = 250000
  ) {}

  /**
   * Returns a table's snapshot if it is cached at the given version.
   *
   * @param tableId the table.
   * @param version the table's current version.
   * @returns the snapshot, or undefined.
   */
  public get(tableId: string, version: number): TableSnapshot | undefined {
    const snapshot = this.entries.get(tableId);
    if (!snapshot) {
      return undefined;
    }
    if (snapshot.table.version !== version) {
      this.delete(tableId);
      return undefined;
    }
    this.entries.delete(tableId);
    this.entries.set(tableId, snapshot);
    return snapshot;
  }

  /**
   * Returns a table's snapshot whatever its version, without refreshing it.
   *
   * @param tableId the table.
   * @returns the snapshot, or undefined.
   */
  public peek(tableId: string): TableSnapshot | undefined {
    return this.entries.get(tableId);
  }

  /**
   * Caches a table's snapshot, replacing any other version of it.
   *
   * @param snapshot the snapshot.
   */
  public set(snapshot: TableSnapshot) {
    this.delete(snapshot.table.id);
    this.entries.set(snapshot.table.id, snapshot);
    this.recordCount += snapshot.records.length;
    for (const [tableId, oldest] of this.entries) {
      if (
        this.entries.size <= this.maxTables &&
        this.recordCount <= this.maxRecords
      ) {
        break;
      }
      if (oldest === snapshot) {
        continue;
      }
      this.delete(tableId);
    }
  }

  /**
   * Forgets a table.
   *
   * @param tableId the table.
   */
  public delete(tableId: string) {
    const snapshot = this.entries.get(tableId);
    if (snapshot) {
      this.recordCount -= snapshot.records.length;
      this.entries.delete(tableId);
    }
  }

  /** Forgets every table. */
  public clear() {
    this.entries.clear();
    this.recordCount = 0;
  }

  private entries = new Map<string, TableSnapshot>();

  private recordCount = 0;
}

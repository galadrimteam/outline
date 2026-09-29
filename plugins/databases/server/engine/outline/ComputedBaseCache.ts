import type { ComputedBase } from "./query/contract";
import type { TableSnapshot } from "./types";

/**
 * The computed cells of the bases a process has read, keyed by the versions
 * of their tables, so that reading a page of a big table does not compute
 * every formula and rollup again. Entries also expire, so that formulas
 * reading the clock (TODAY(), NOW()) move on without a write.
 */
export class ComputedBaseCache {
  /**
   * @param maxEntries how many computed bases to keep at most.
   * @param maxAgeMs how long a computed base is served, in milliseconds.
   */
  constructor(
    private readonly maxEntries = 30,
    private readonly maxAgeMs = 5 * 60 * 1000
  ) {}

  /**
   * Returns the key of a set of tables at their current versions.
   *
   * @param tables the tables.
   * @returns the key.
   */
  public static keyOf(tables: TableSnapshot[]): string {
    return tables
      .map((snapshot) => `${snapshot.table.id}:${snapshot.table.version}`)
      .sort()
      .join(",");
  }

  /**
   * Returns the computed base of tables, computing it when it is not cached.
   *
   * @param tables the tables.
   * @param compute computes the base.
   * @returns the computed base.
   */
  public getOrCompute(
    tables: TableSnapshot[],
    compute: () => ComputedBase
  ): ComputedBase {
    const key = ComputedBaseCache.keyOf(tables);
    const entry = this.entries.get(key);
    if (entry && Date.now() - entry.at < this.maxAgeMs) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.base;
    }
    const base = compute();
    this.entries.delete(key);
    this.entries.set(key, { base, at: Date.now() });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) {
        break;
      }
      this.entries.delete(oldest);
    }
    return base;
  }

  /** Forgets every computed base. */
  public clear() {
    this.entries.clear();
  }

  private entries = new Map<string, { base: ComputedBase; at: number }>();
}

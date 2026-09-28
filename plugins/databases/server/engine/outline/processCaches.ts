import { ComputedBaseCache } from "./ComputedBaseCache";
import { SequelizeOutlineStore } from "./store/SequelizeOutlineStore";

let store: SequelizeOutlineStore | undefined;
let computedBases: ComputedBaseCache | undefined;

/**
 * Returns the Postgres store of this process: one instance, so that its
 * snapshot cache serves every request.
 *
 * @returns the store.
 */
export function processOutlineStore(): SequelizeOutlineStore {
  store ??= new SequelizeOutlineStore();
  return store;
}

/**
 * Returns the computed bases of this process, shared by every engine.
 *
 * @returns the cache.
 */
export function processComputedBases(): ComputedBaseCache {
  computedBases ??= new ComputedBaseCache();
  return computedBases;
}

import { randomInt } from "node:crypto";

/** What an engine id names, by its Teable prefix. */
export type EngineIdKind = "tbl" | "bse" | "fld" | "viw" | "rec" | "cho";

const idAlphabet =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Returns a new engine id in Teable's format: its prefix and 16 letters or
 * digits, so that ids made here and ids moved from Teable look alike.
 *
 * @param kind the prefix.
 * @returns the id.
 */
export function generateEngineId(kind: EngineIdKind): string {
  let id: string = kind;
  for (let i = 0; i < 16; i++) {
    id += idAlphabet[randomInt(idAlphabet.length)];
  }
  return id;
}

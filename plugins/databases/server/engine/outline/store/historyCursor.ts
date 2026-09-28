import { ValidationError } from "@server/errors";
import type { EngineHistoryRow } from "../types";

/** Where the next page of a record's history starts: after this entry. */
export interface HistoryCursor {
  createdAt: string;
  id: string;
}

/**
 * Returns the cursor of the page following an entry.
 *
 * @param row the last entry of a page.
 * @returns an opaque cursor.
 */
export function encodeHistoryCursor(
  row: Pick<EngineHistoryRow, "createdAt" | "id">
): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt, id: row.id })
  ).toString("base64url");
}

/**
 * Reads a cursor made by `encodeHistoryCursor`.
 *
 * @param cursor the cursor.
 * @returns the entry the next page starts after.
 * @throws ValidationError when the cursor was not made here.
 */
export function decodeHistoryCursor(cursor: string): HistoryCursor {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    if (
      typeof value === "object" &&
      value !== null &&
      "createdAt" in value &&
      "id" in value &&
      typeof value.createdAt === "string" &&
      typeof value.id === "string"
    ) {
      return { createdAt: value.createdAt, id: value.id };
    }
  } catch {
    // An unreadable cursor is reported below.
  }
  throw ValidationError("Invalid history cursor");
}

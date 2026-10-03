import { createContext, useContext } from "react";
import type { DatabaseView } from "@shared/databases/types";

/** A request to open the filter of the view on a property. */
export interface FilterRequest {
  fieldId: string;
  /** Distinguishes two requests on the same property. */
  at: number;
}

/** What a database block offers to the parts drawn inside it (toolbar, views). */
export interface DatabaseBlockContextValue {
  /**
   * Shows a view that was just created as the active tab; a linked view also
   * adds it to the views it shows.
   */
  onViewCreated: (view: DatabaseView) => void;
  /** The last request to filter on a property, eg « Filter » in a column menu. */
  filterRequest: FilterRequest | undefined;
  /** Opens the comments of a row, from the comment count of a card or a table row. */
  onOpenComments?: (recordId: string) => void;
}

/** Provided by `DatabaseBlock` around its toolbar and view. */
export const DatabaseBlockContext = createContext<
  DatabaseBlockContextValue | undefined
>(undefined);

/**
 * Returns the database block the component is drawn in.
 *
 * @returns the block's context, undefined outside a block.
 */
export function useDatabaseBlock(): DatabaseBlockContextValue | undefined {
  return useContext(DatabaseBlockContext);
}

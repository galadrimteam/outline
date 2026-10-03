import type {
  DatabaseCellInput,
  DatabaseRecordOrder,
  DatabaseView,
} from "@shared/databases/types";
import type Database from "~/models/Database";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";

/** What every database view layout (table, board, calendar…) receives from the block. */
export interface DatabaseViewProps {
  /** The database whose rows are shown. */
  database: Database;
  /** The view being drawn. */
  view: DatabaseView;
  /** The rows of the view, with the reader's temporary filter, sort and search applied. */
  query: RecordQuery;
  /** Whether the reader may only look. */
  readOnly: boolean;
  /** Opens the row's page. */
  onOpenRecord: (recordId: string) => void;
  /**
   * Creates a row, optionally prefilled and placed next to another one in a view; absent when
   * the reader cannot write.
   */
  onCreateRecord?: (
    fields?: Record<string, DatabaseCellInput>,
    order?: DatabaseRecordOrder
  ) => Promise<void>;
}

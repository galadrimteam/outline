import type { DatabaseActor } from "../DatabaseEngine";
import type {
  DatabaseDuplicatedTable,
  DatabaseTablesDuplicate,
  DatabaseTablesDuplicator,
} from "../DatabaseTablesDuplicator";

/** A call received by the fake duplicator, for assertions. */
export interface FakeTablesDuplicatorCall {
  actor: DatabaseActor;
  input: DatabaseTablesDuplicate;
}

/**
 * An in-memory table duplicator for tests: the copy of an id is the id
 * followed by `Copy` and the number of the copy, for the table, the fields and
 * the views of `FakeEngine`.
 */
export class FakeTablesDuplicator implements DatabaseTablesDuplicator {
  public calls: FakeTablesDuplicatorCall[] = [];

  /**
   * @param fieldIds the field ids every table has.
   * @param viewIds the view ids every table has.
   */
  constructor(
    private readonly fieldIds: string[] = ["fldName", "fldStatus", "fldPerson"],
    private readonly viewIds: string[] = ["viwGrid", "viwBoard"]
  ) {}

  async duplicateTables(
    actor: DatabaseActor,
    input: DatabaseTablesDuplicate
  ): Promise<DatabaseDuplicatedTable[]> {
    this.calls.push({ actor, input });
    return input.tables.map((table) => {
      this.copies += 1;
      const suffix = `Copy${this.copies}`;
      return {
        sourceTableId: table.externalTableId,
        externalTableId: `${table.externalTableId}${suffix}`,
        fieldIds: Object.fromEntries(
          this.fieldIds.map((id) => [id, `${id}${suffix}`])
        ),
        viewIds: Object.fromEntries(
          this.viewIds.map((id) => [id, `${id}${suffix}`])
        ),
      };
    });
  }

  private copies = 0;
}

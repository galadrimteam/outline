import { DatabaseFieldType } from "@shared/databases/types";
import type { DatabaseFieldOptions } from "@shared/databases/types";
import { linkIds, setLinks, unlinkRecords } from "./links";
import type { EngineFieldRow, EngineRecordRow, TableSnapshot } from "./types";
import { WriteBatch } from "./WriteBatch";

function link(
  id: string,
  tableId: string,
  options: DatabaseFieldOptions
): EngineFieldRow {
  return {
    id,
    tableId,
    name: id,
    type: DatabaseFieldType.Link,
    description: null,
    options,
    lookupOptions: null,
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue:
      options.relationship === "manyMany" || options.relationship === "oneMany",
    order: 1,
  };
}

function record(
  id: string,
  tableId: string,
  cells: EngineRecordRow["cells"] = {}
): EngineRecordRow {
  return {
    id,
    tableId,
    cells,
    autoNumber: 1,
    orders: {},
    createdTime: "",
    lastModifiedTime: "",
    createdBy: null,
    lastModifiedBy: null,
  };
}

function table(
  id: string,
  fields: EngineFieldRow[],
  records: EngineRecordRow[]
): TableSnapshot {
  return {
    table: { id, baseId: "bse", teamId: "team", name: id, version: 1 },
    fields,
    views: [],
    records,
  };
}

/** People (oneMany: a person has several desks) and desks (manyOne). */
function peopleAndDesks(
  relationship: "oneMany" | "oneOne" | "manyMany" = "oneMany"
) {
  const desks = link("fldDesks", "tblPeople", {
    foreignTableId: "tblDesks",
    relationship,
    symmetricFieldId: "fldOwner",
  });
  const owner = link("fldOwner", "tblDesks", {
    foreignTableId: "tblPeople",
    relationship: relationship === "oneMany" ? "manyOne" : relationship,
    symmetricFieldId: "fldDesks",
  });
  const batch = new WriteBatch(
    [
      table(
        "tblPeople",
        [desks],
        [record("recAda", "tblPeople"), record("recBob", "tblPeople")]
      ),
      table(
        "tblDesks",
        [owner],
        [record("recD1", "tblDesks"), record("recD2", "tblDesks")]
      ),
    ],
    { actorId: "user", now: new Date(), history: true }
  );
  return { batch, desks, owner };
}

describe("setLinks", () => {
  it("writes the symmetric cells of the records added and removed", () => {
    const { batch, desks } = peopleAndDesks();
    setLinks(batch, "tblPeople", "recAda", desks, ["recD1", "recD2"]);
    expect(linkIds(batch.cell("tblDesks", "recD1", "fldOwner"))).toEqual([
      "recAda",
    ]);

    setLinks(batch, "tblPeople", "recAda", desks, ["recD2"]);
    expect(batch.cell("tblDesks", "recD1", "fldOwner")).toBeNull();
    expect(linkIds(batch.cell("tblDesks", "recD2", "fldOwner"))).toEqual([
      "recAda",
    ]);
  });

  it("takes a record from its previous owner when the other side holds one", () => {
    const { batch, desks } = peopleAndDesks();
    setLinks(batch, "tblPeople", "recAda", desks, ["recD1"]);
    setLinks(batch, "tblPeople", "recBob", desks, ["recD1"]);
    expect(batch.cell("tblPeople", "recAda", "fldDesks")).toBeNull();
    expect(linkIds(batch.cell("tblDesks", "recD1", "fldOwner"))).toEqual([
      "recBob",
    ]);
  });

  it("keeps one record in a single link", () => {
    const { batch, owner } = peopleAndDesks("oneOne");
    setLinks(batch, "tblDesks", "recD1", owner, ["recAda", "recBob"]);
    expect(linkIds(batch.cell("tblDesks", "recD1", "fldOwner"))).toEqual([
      "recAda",
    ]);
  });

  it("refuses a record that does not exist", () => {
    const { batch, desks } = peopleAndDesks();
    expect(() =>
      setLinks(batch, "tblPeople", "recAda", desks, ["recNope"])
    ).toThrow();
  });

  it("records the history of both sides", () => {
    const { batch, desks } = peopleAndDesks("manyMany");
    setLinks(batch, "tblPeople", "recAda", desks, ["recD1"]);
    const history = batch
      .mutations()
      .flatMap((mutation) => mutation.history ?? []);
    expect(
      history.map((row) => [row.recordId, row.fieldId, row.after])
    ).toEqual([
      ["recAda", "fldDesks", [{ id: "recD1" }]],
      ["recD1", "fldOwner", [{ id: "recAda" }]],
    ]);
  });
});

describe("unlinkRecords", () => {
  it("removes deleted records from the cells pointing at them", () => {
    const { batch, desks } = peopleAndDesks("manyMany");
    setLinks(batch, "tblPeople", "recAda", desks, ["recD1", "recD2"]);
    batch.deleteRecords("tblDesks", ["recD1"]);
    unlinkRecords(batch, "tblDesks", ["recD1"]);
    expect(linkIds(batch.cell("tblPeople", "recAda", "fldDesks"))).toEqual([
      "recD2",
    ]);
  });
});

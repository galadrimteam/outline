import { DatabaseFieldType } from "@shared/databases/types";
import type {
  TeableBaseSource,
  TeableFile,
  TeableUser,
} from "../teable/TeableBaseReader";
import type {
  TeableField,
  TeableRecord,
  TeableTableMetaVo,
  TeableView,
} from "../teable/types";

/**
 * A Teable base in memory for route tests: one table « One » with a primary
 * text field, a grid view and two records.
 */
export class FakeTeableBase implements TeableBaseSource {
  async tables(): Promise<TeableTableMetaVo[]> {
    return [
      {
        id: "tblOne",
        name: "One",
        lastModifiedTime: "2026-01-01T00:00:00.000Z",
      },
    ];
  }

  async fields(): Promise<TeableField[]> {
    return [
      {
        id: "fldName",
        name: "Name",
        type: DatabaseFieldType.SingleLineText,
        options: {},
        isPrimary: true,
        cellValueType: "string",
      },
    ];
  }

  async views(): Promise<TeableView[]> {
    return [{ id: "viwGrid", name: "Grid", type: "grid", order: 0 }];
  }

  async records(): Promise<TeableRecord[]> {
    return [
      { id: "recOne", autoNumber: 1, fields: { fldName: "First" } },
      { id: "recTwo", autoNumber: 2, fields: { fldName: "Second" } },
    ];
  }

  async viewRecordIds(): Promise<string[]> {
    return ["recTwo", "recOne"];
  }

  async users(): Promise<TeableUser[]> {
    return [];
  }

  async download(): Promise<TeableFile> {
    throw new Error("The fake base has no files");
  }
}

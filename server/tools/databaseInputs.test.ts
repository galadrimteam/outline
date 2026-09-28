import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type {
  DatabaseLinkResolver,
  DatabasePeopleResolver,
} from "./databaseInputs";
import { DatabaseInputTranslator, DatabaseSchemaIndex } from "./databaseInputs";

const people: DatabasePeopleResolver = {
  outlineUserIds: async (refs) => refs.map((ref) => `user:${ref}`),
  engineUserIds: async (refs) => refs.map((ref) => `usr:${ref}`),
};

const links: DatabaseLinkResolver = {
  recordIds: async (_field, refs) => refs.map((ref) => `rec:${ref}`),
};

const fields: DatabaseField[] = [
  field("fldName", "Name", DatabaseFieldType.SingleLineText, {
    isPrimary: true,
  }),
  field("fldTags", "Tags", DatabaseFieldType.MultipleSelect, {
    isMultipleCellValue: true,
    options: {
      choices: [
        { name: "Front", color: "blue" },
        { name: "Back, API", color: "red" },
        { name: "Ops", color: "green" },
      ],
    },
  }),
  field("fldStatus", "Status", DatabaseFieldType.SingleSelect, {
    options: {
      choices: [
        { name: "To do", color: "grey" },
        { name: "Done", color: "green" },
      ],
    },
  }),
  field("fldPoints", "Points", DatabaseFieldType.Number, {
    cellValueType: "number",
  }),
  field("fldDone", "Done?", DatabaseFieldType.Checkbox, {
    cellValueType: "boolean",
  }),
  field("fldOwner", "Owner", DatabaseFieldType.User),
  field("fldProject", "Project", DatabaseFieldType.Link, {
    isMultipleCellValue: true,
  }),
  field("fldTotal", "Total", DatabaseFieldType.Formula, {
    isComputed: true,
    cellValueType: "number",
  }),
];

const translator = new DatabaseInputTranslator(
  new DatabaseSchemaIndex({ fields, views: [] }),
  people,
  links,
  "Europe/Paris"
);

describe("DatabaseInputTranslator", () => {
  describe("filter", () => {
    it("reads is on a multi-select as has any of", async () => {
      const filter = await translator.filter([
        { property: "tags", operator: "is", value: "front" },
      ]);
      expect(filter?.filterSet).toEqual([
        { fieldId: "fldTags", operator: "hasAnyOf", value: ["Front"] },
      ]);
    });

    it("reads is with a list on a single select as is any of", async () => {
      const filter = await translator.filter([
        { property: "Status", operator: "is", value: ["to do", "DONE"] },
      ]);
      expect(filter?.filterSet).toEqual([
        {
          fieldId: "fldStatus",
          operator: "isAnyOf",
          value: ["To do", "Done"],
        },
      ]);
    });

    it("reads numbers and checkboxes written as text", async () => {
      const filter = await translator.filter([
        { property: "Points", operator: "greater_than", value: "3,5" },
        { property: "Done?", operator: "is", value: "false" },
        { property: "Owner", operator: "is_empty" },
      ]);
      expect(filter?.filterSet).toEqual([
        { fieldId: "fldPoints", operator: "isGreater", value: 3.5 },
        { fieldId: "fldDone", operator: "is", value: false },
        { fieldId: "fldOwner", operator: "isEmpty", value: null },
      ]);
    });

    it("finds linked rows by title, but matches text with contains", async () => {
      const filter = await translator.filter([
        { property: "Project", operator: "has_any_of", value: "Delisle" },
        { property: "Project", operator: "contains", value: "Del" },
      ]);
      expect(filter?.filterSet).toEqual([
        { fieldId: "fldProject", operator: "hasAnyOf", value: ["rec:Delisle"] },
        { fieldId: "fldProject", operator: "contains", value: "Del" },
      ]);
    });

    it("lists the operators a property accepts", async () => {
      await expect(
        translator.filter([
          { property: "Points", operator: "has_all_of", value: [1] },
        ])
      ).rejects.toThrow(/greater_than/);
    });

    it("needs a value for operators that compare", async () => {
      await expect(
        translator.filter([{ property: "Name", operator: "contains" }])
      ).rejects.toThrow(/needs a value/);
    });
  });

  describe("cells", () => {
    it("converts values written by name", async () => {
      const cells = await translator.cells({
        name: "Card",
        Tags: "Front, Ops",
        Status: "done",
        Points: "8",
        "Done?": false,
        Owner: "jane@example.com",
        Project: ["Delisle", "Forest"],
      });
      expect(cells).toEqual({
        fldName: "Card",
        fldTags: ["Front", "Ops"],
        fldStatus: "Done",
        fldPoints: 8,
        fldDone: null,
        fldOwner: { outlineUserId: "user:jane@example.com" },
        fldProject: [{ id: "rec:Delisle" }, { id: "rec:Forest" }],
      });
    });

    it("keeps an option whose name holds a comma", async () => {
      const cells = await translator.cells({ Tags: "Back, API" });
      expect(cells).toEqual({ fldTags: ["Back, API"] });
    });

    it("empties a property with null or an empty string", async () => {
      const cells = await translator.cells({ Status: null, Owner: "" });
      expect(cells).toEqual({ fldStatus: null, fldOwner: null });
    });

    it("refuses computed properties and several people in a single one", async () => {
      await expect(translator.cells({ Total: 3 })).rejects.toThrow(
        /cannot be written/
      );
      await expect(
        translator.cells({ Owner: ["a@example.com", "b@example.com"] })
      ).rejects.toThrow(/single value/);
    });
  });
});

function field(
  id: string,
  name: string,
  type: DatabaseFieldType,
  overrides: Partial<DatabaseField> = {}
): DatabaseField {
  return {
    id,
    name,
    type,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: false,
    ...overrides,
  };
}

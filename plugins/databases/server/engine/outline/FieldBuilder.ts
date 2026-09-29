import type {
  DatabaseFieldOptions,
  DatabaseFieldType,
  DatabaseLookupOptions,
} from "@shared/databases/types";
import { DatabaseFieldType as FieldType } from "@shared/databases/types";
import { ValidationError } from "@server/errors";
import { generateEngineId } from "./ids";
import type { OutlineQuery } from "./query/contract";
import {
  isComputedType,
  isMultipleRelationship,
  reverseRelationship,
  storedCellType,
  uniqueName,
  viewWithoutFields,
  withAppendedColumn,
} from "./schema";
import type { EngineFieldRow, TableSnapshot } from "./types";
import type { WriteBatch } from "./WriteBatch";

/** A field to build: what the caller decides, before types are worked out. */
export interface FieldDraft {
  id: string;
  tableId: string;
  name: string;
  type: DatabaseFieldType;
  description: string | null;
  options: DatabaseFieldOptions;
  lookupOptions: DatabaseLookupOptions | null;
  isPrimary: boolean;
  isLookup: boolean;
  order: number;
}

/**
 * Builds the fields of a write: the types of their cells (inferred for
 * formulas, rollups and lookups), the symmetric field of a two-way link, and
 * their place in the views of their table.
 */
export class FieldBuilder {
  /**
   * @param query infers the type of computed fields.
   */
  constructor(private readonly query: OutlineQuery) {}

  /**
   * Returns a field that is not a link, ready to store.
   *
   * @param batch the write, whose tables a computed field may read.
   * @param draft the field.
   * @returns the field.
   * @throws ValidationError when a computed field cannot be computed.
   */
  public field(batch: WriteBatch, draft: FieldDraft): EngineFieldRow {
    if (
      draft.type === FieldType.SingleSelect ||
      draft.type === FieldType.MultipleSelect
    ) {
      draft = { ...draft, options: withChoiceIds(draft.options) };
    }
    const computed = draft.isLookup || isComputedType(draft.type);
    if (
      !draft.isLookup &&
      !(
        draft.type === FieldType.Formula ||
        draft.type === FieldType.Rollup ||
        draft.type === FieldType.ConditionalRollup
      )
    ) {
      return {
        ...draft,
        isComputed: computed,
        ...storedCellType(draft.type, draft.options),
      };
    }

    const tables = this.tables(batch);
    const table = tables.find(
      (snapshot) => snapshot.table.id === draft.tableId
    );
    if (!table) {
      throw ValidationError("The table of the field does not exist");
    }
    const inferred = this.query.inferType(
      {
        type: draft.type,
        options: draft.options,
        lookupOptions: draft.lookupOptions,
      },
      {
        ...table,
        fields: [
          ...table.fields.filter((field) => field.id !== draft.id),
          {
            ...draft,
            isComputed: true,
            cellValueType: "string",
            isMultipleCellValue: false,
          },
        ],
      },
      tables
    );
    if (inferred.error) {
      throw ValidationError(inferred.error);
    }
    return {
      ...draft,
      isComputed: true,
      cellValueType: inferred.cellValueType,
      isMultipleCellValue: inferred.isMultipleCellValue,
    };
  }

  /**
   * Returns a link field, ready to store, and adds the symmetric field of a
   * two-way link to the linked table (named after this table), unless the
   * draft already names an existing one.
   *
   * @param batch the write, holding the linked table.
   * @param draft the link field; `options.foreignTableId` names the linked table.
   * @returns the link field.
   * @throws ValidationError when the linked table is unknown.
   */
  public link(batch: WriteBatch, draft: FieldDraft): EngineFieldRow {
    const foreignTableId = draft.options.foreignTableId;
    if (!foreignTableId || !batch.hasTable(foreignTableId)) {
      throw ValidationError("The relation links to an unknown database");
    }
    const relationship = draft.options.relationship ?? "manyMany";
    const isOneWay = !!draft.options.isOneWay;
    const foreignFields = batch.fields(foreignTableId);
    const foreignPrimary = foreignFields.find((field) => field.isPrimary);
    const existingSymmetric =
      !isOneWay && draft.options.symmetricFieldId
        ? batch.field(foreignTableId, draft.options.symmetricFieldId)
        : undefined;
    const symmetricFieldId = isOneWay
      ? undefined
      : (existingSymmetric?.id ?? generateEngineId("fld"));

    const { symmetricFieldId: _previous, ...options } = draft.options;
    const field: EngineFieldRow = {
      ...draft,
      type: FieldType.Link,
      options: {
        ...options,
        foreignTableId,
        relationship,
        lookupFieldId: foreignPrimary?.id ?? draft.options.lookupFieldId,
        isOneWay,
        ...(symmetricFieldId ? { symmetricFieldId } : {}),
      },
      lookupOptions: null,
      isComputed: false,
      isLookup: false,
      cellValueType: "string",
      isMultipleCellValue: isMultipleRelationship(relationship),
    };

    if (symmetricFieldId && !existingSymmetric) {
      const table = batch.snapshot(draft.tableId).table;
      const sameTable = foreignTableId === draft.tableId;
      const taken = [
        ...foreignFields.map((item) => item.name),
        ...(sameTable ? [draft.name] : []),
      ];
      const primary = batch
        .fields(draft.tableId)
        .find((item) => item.isPrimary);
      const foreignBaseId = batch.snapshot(foreignTableId).table.baseId;
      const reverse = reverseRelationship(relationship);
      batch.upsertField({
        id: symmetricFieldId,
        tableId: foreignTableId,
        name: uniqueName(table.name, taken),
        type: FieldType.Link,
        description: null,
        options: {
          foreignTableId: draft.tableId,
          relationship: reverse,
          lookupFieldId: primary?.id,
          isOneWay: false,
          symmetricFieldId: draft.id,
          ...(foreignBaseId !== table.baseId ? { baseId: table.baseId } : {}),
        },
        lookupOptions: null,
        isPrimary: false,
        isComputed: false,
        isLookup: false,
        cellValueType: "string",
        isMultipleCellValue: isMultipleRelationship(reverse),
        order: Math.max(
          this.nextOrder(batch, foreignTableId),
          sameTable ? draft.order + 1 : 0
        ),
      });
      this.addColumn(batch, foreignTableId, symmetricFieldId);
    } else if (existingSymmetric) {
      const reverse = reverseRelationship(relationship);
      batch.upsertField({
        ...existingSymmetric,
        options: {
          ...existingSymmetric.options,
          relationship: reverse,
          symmetricFieldId: draft.id,
          isOneWay: false,
        },
        isMultipleCellValue: isMultipleRelationship(reverse),
      });
    }
    return field;
  }

  /**
   * Returns the order after the last field of a table.
   *
   * @param batch the write.
   * @param tableId the table.
   * @returns the order.
   */
  public nextOrder(batch: WriteBatch, tableId: string): number {
    const orders = batch.fields(tableId).map((field) => field.order);
    return orders.length ? Math.max(...orders) + 1 : 0;
  }

  /**
   * Appends a field to the views of its table, shown in the view it was
   * added from.
   *
   * @param batch the write.
   * @param tableId the table.
   * @param fieldId the field.
   * @param viewId the view the field was added from.
   */
  public addColumn(
    batch: WriteBatch,
    tableId: string,
    fieldId: string,
    viewId?: string
  ) {
    for (const view of batch.views(tableId)) {
      batch.upsertView({
        ...view,
        columnMeta: withAppendedColumn(view, fieldId, view.id === viewId),
      });
    }
  }

  /**
   * Appends a field to the views of its table, right after another field in
   * the view it was added from, as a duplicated field is.
   *
   * @param batch the write.
   * @param tableId the table.
   * @param afterId the field it follows.
   * @param fieldId the field.
   * @param viewId the view it was added from.
   */
  public addColumnAfter(
    batch: WriteBatch,
    tableId: string,
    afterId: string,
    fieldId: string,
    viewId?: string
  ) {
    this.addColumn(batch, tableId, fieldId, viewId);
    const view = viewId
      ? batch.views(tableId).find((item) => item.id === viewId)
      : undefined;
    const afterOrder = view?.columnMeta[afterId]?.order;
    if (!view || afterOrder === undefined) {
      return;
    }
    const later = Object.entries(view.columnMeta)
      .filter(([id, meta]) => id !== fieldId && meta.order > afterOrder)
      .map(([, meta]) => meta.order);
    batch.upsertView({
      ...view,
      columnMeta: {
        ...view.columnMeta,
        [fieldId]: {
          ...view.columnMeta[fieldId],
          order: later.length
            ? (Math.min(...later) + afterOrder) / 2
            : afterOrder + 1,
        },
      },
    });
  }

  /**
   * Removes fields from the views of their table: columns, sorts, groups,
   * filters and options naming them.
   *
   * @param batch the write.
   * @param tableId the table.
   * @param fieldIds the fields.
   */
  public removeFromViews(
    batch: WriteBatch,
    tableId: string,
    fieldIds: string[]
  ) {
    const removed = new Set(fieldIds);
    for (const view of batch.views(tableId)) {
      const next = viewWithoutFields(view, removed);
      if (next !== view) {
        batch.upsertView(next);
      }
    }
  }

  /**
   * Returns the tables of a write with the fields it has so far.
   *
   * @param batch the write.
   * @returns the tables.
   */
  public tables(batch: WriteBatch): TableSnapshot[] {
    return batch.tableIds().map((tableId) => ({
      ...batch.snapshot(tableId),
      fields: batch.fields(tableId),
    }));
  }
}

/**
 * Gives each choice of a select an id, as Teable does, so that renaming a
 * choice renames the values holding it.
 */
function withChoiceIds(options: DatabaseFieldOptions): DatabaseFieldOptions {
  if (!options.choices?.some((choice) => !choice.id)) {
    return options;
  }
  return {
    ...options,
    choices: options.choices.map((choice) =>
      choice.id ? choice : { ...choice, id: generateEngineId("cho") }
    ),
  };
}

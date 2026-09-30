import type {
  DatabaseCellValue,
  DatabaseFieldOptions,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { NotFoundError } from "@server/errors";
import type { DatabaseFieldConvert } from "../DatabaseEngine";
import type { FieldBuilder } from "./FieldBuilder";
import {
  holdsSeveral,
  isLinkField,
  linkIds,
  linkValue,
  setLinks,
} from "./links";
import type { ComputedBase, OutlineQuery } from "./query/contract";
import { toDatabaseField, withChoices } from "./schema";
import type { EngineFieldRow } from "./types";
import type { WriteBatch } from "./WriteBatch";

const selectTypes = new Set<DatabaseFieldType>([
  DatabaseFieldType.SingleSelect,
  DatabaseFieldType.MultipleSelect,
]);

/**
 * Changes the type or the options of a field and converts its values, as
 * Teable does: a stored field's values go through `convertCell` (a select
 * gaining the choices its new values need), a computed field's values are
 * kept as they were last computed when it becomes a stored one, a stored
 * field's values are dropped when it becomes a computed one, and text becomes
 * links by the titles of the linked records.
 */
export class FieldConverter {
  /**
   * @param query converts cells and reads their text.
   * @param builder builds the converted field.
   */
  constructor(
    private readonly query: OutlineQuery,
    private readonly builder: FieldBuilder
  ) {}

  /**
   * Converts a field. A link's linked table must already be in the batch.
   *
   * @param batch the write.
   * @param computed the computed base before the write.
   * @param tableId the table of the field.
   * @param fieldId the field.
   * @param input the new type and options.
   * @returns the converted field.
   * @throws NotFoundError when the field does not exist.
   */
  public convert(
    batch: WriteBatch,
    computed: ComputedBase,
    tableId: string,
    fieldId: string,
    input: DatabaseFieldConvert
  ): EngineFieldRow {
    const from = batch.field(tableId, fieldId);
    if (!from) {
      throw NotFoundError("Field not found");
    }
    const { foreignDatabaseId: _database, ...given } =
      input.options ?? (input.type === from.type ? from.options : {});
    const keepsLookup =
      input.type === from.type ||
      (input.type === DatabaseFieldType.Rollup && !!from.lookupOptions);
    const draft = {
      id: from.id,
      tableId,
      name: from.name,
      type: input.type,
      description: from.description,
      options: given,
      lookupOptions:
        input.lookupOptions ?? (keepsLookup ? from.lookupOptions : null),
      isPrimary: from.isPrimary,
      isLookup: input.isLookup ?? (from.isLookup && input.type === from.type),
      order: from.order,
    };

    const wasLink = isLinkField(from);
    const toLink = input.type === DatabaseFieldType.Link && !draft.isLookup;

    if (wasLink && toLink) {
      const foreignTableId =
        given.foreignTableId ?? from.options.foreignTableId;
      if (foreignTableId === from.options.foreignTableId) {
        return this.relink(batch, from, { ...given, foreignTableId });
      }
    }
    if (wasLink) {
      this.dropSymmetric(batch, from);
    }
    if (toLink) {
      return this.linkFromText(batch, computed, from, {
        ...draft,
        options: { ...given, symmetricFieldId: undefined },
      });
    }

    const texts = computed.records(tableId).map((record) => ({
      id: record.row.id,
      value: record.cells[fieldId] ?? null,
    }));
    const fromField = toDatabaseField(from);
    let options: DatabaseFieldOptions = draft.options;
    if (selectTypes.has(input.type) && !selectTypes.has(from.type)) {
      options = withChoices(
        options,
        this.query.choicesFor(
          texts.map((item) => item.value),
          fromField
        )
      );
    }
    const field = this.builder.field(batch, { ...draft, options });
    batch.upsertField(field);

    if (field.isComputed) {
      if (!from.isComputed && !from.isLookup) {
        for (const record of batch.snapshot(tableId).records) {
          if (record.cells[fieldId] !== undefined) {
            batch.setCell(tableId, record.id, fieldId, null);
          }
        }
      }
      return field;
    }

    const toField = toDatabaseField(field);
    const renamed = renamedChoices(from.options, field.options);
    for (const { id, value } of texts) {
      batch.setCell(
        tableId,
        id,
        fieldId,
        value === null
          ? null
          : renamed.size
            ? this.query.convertCell(
                renameChoices(value, renamed),
                toField,
                toField
              )
            : this.query.convertCell(value, fromField, toField)
      );
    }
    return field;
  }

  /** A link keeping its linked table: relationship or direction changed. */
  private relink(
    batch: WriteBatch,
    from: EngineFieldRow,
    options: DatabaseFieldOptions
  ): EngineFieldRow {
    const becomesOneWay = !!options.isOneWay;
    const symmetricFieldId =
      !becomesOneWay && !from.options.isOneWay
        ? from.options.symmetricFieldId
        : undefined;
    if (becomesOneWay) {
      this.dropSymmetric(batch, from);
    }
    const field = this.builder.link(batch, {
      ...from,
      options: { ...from.options, ...options, symmetricFieldId },
    });
    batch.upsertField(field);
    this.rebuildLinks(batch, from.tableId, field);
    return field;
  }

  /** A field becoming a link: each record links to the records its text names. */
  private linkFromText(
    batch: WriteBatch,
    computed: ComputedBase,
    from: EngineFieldRow,
    draft: Parameters<FieldBuilder["link"]>[1]
  ): EngineFieldRow {
    const texts = computed.records(from.tableId).map((record) => ({
      id: record.row.id,
      text: this.query.cellText(
        record.cells[from.id] ?? null,
        toDatabaseField(from)
      ),
    }));
    const field = this.builder.link(batch, draft);
    batch.upsertField(field);

    const foreignTableId = field.options.foreignTableId ?? "";
    const titleField = batch
      .fields(foreignTableId)
      .find((item) => item.id === field.options.lookupFieldId);
    const idsByTitle = new Map<string, string[]>();
    if (titleField) {
      for (const record of computed.records(foreignTableId)) {
        const title = this.query
          .cellText(
            record.cells[titleField.id] ?? null,
            toDatabaseField(titleField)
          )
          .trim();
        if (title) {
          idsByTitle.set(title, [
            ...(idsByTitle.get(title) ?? []),
            record.row.id,
          ]);
        }
      }
    }

    for (const { id, text } of texts) {
      batch.setCell(from.tableId, id, from.id, null);
      const ids = text
        .split(",")
        .map((part) => part.trim())
        .flatMap((title) => idsByTitle.get(title)?.slice(0, 1) ?? []);
      if (ids.length) {
        setLinks(batch, from.tableId, id, field, ids);
      }
    }
    return field;
  }

  /**
   * Makes both sides of a link agree again after its relationship changed:
   * each cell keeps what its relationship allows, and the symmetric cells
   * are rebuilt from this side.
   */
  private rebuildLinks(
    batch: WriteBatch,
    tableId: string,
    field: EngineFieldRow
  ) {
    const foreignTableId = field.options.foreignTableId;
    const symmetric =
      foreignTableId && field.options.symmetricFieldId
        ? batch.field(foreignTableId, field.options.symmetricFieldId)
        : undefined;

    const links = new Map<string, string[]>();
    for (const record of batch.records(tableId)) {
      let ids = linkIds(record.cells[field.id]);
      if (!holdsSeveral(field)) {
        ids = ids.slice(0, 1);
      }
      links.set(record.id, ids);
    }
    if (!symmetric || !foreignTableId) {
      for (const [recordId, ids] of links) {
        batch.setCell(tableId, recordId, field.id, linkValue(ids));
      }
      return;
    }

    const owners = new Map<string, string[]>();
    for (const [recordId, ids] of links) {
      const kept: string[] = [];
      for (const id of ids) {
        const current = owners.get(id) ?? [];
        if (!holdsSeveral(symmetric) && current.length) {
          continue;
        }
        owners.set(id, [...current, recordId]);
        kept.push(id);
      }
      batch.setCell(tableId, recordId, field.id, linkValue(kept));
    }
    for (const record of batch.records(foreignTableId)) {
      batch.setCell(
        foreignTableId,
        record.id,
        symmetric.id,
        linkValue(owners.get(record.id) ?? [])
      );
    }
  }

  /** Deletes the symmetric field of a two-way link, with its columns. */
  private dropSymmetric(batch: WriteBatch, field: EngineFieldRow) {
    const { foreignTableId, symmetricFieldId, isOneWay } = field.options;
    if (isOneWay || !foreignTableId || !symmetricFieldId) {
      return;
    }
    if (!batch.field(foreignTableId, symmetricFieldId)) {
      return;
    }
    batch.deleteField(foreignTableId, symmetricFieldId);
    this.builder.removeFromViews(batch, foreignTableId, [symmetricFieldId]);
  }
}

/** Old name → new name of the choices kept under the same id with another name. */
function renamedChoices(
  from: DatabaseFieldOptions,
  to: DatabaseFieldOptions
): Map<string, string> {
  const renamed = new Map<string, string>();
  for (const choice of to.choices ?? []) {
    const previous = choice.id
      ? from.choices?.find((item) => item.id === choice.id)
      : undefined;
    if (previous && previous.name !== choice.name) {
      renamed.set(previous.name, choice.name);
    }
  }
  return renamed;
}

function renameChoices(
  value: DatabaseCellValue,
  renamed: Map<string, string>
): DatabaseCellValue {
  if (typeof value === "string") {
    return renamed.get(value) ?? value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => renamed.get(item) ?? item);
  }
  return value;
}

import type { DatabaseCellValue } from "@shared/databases/types";
import { NotFoundError } from "@server/errors";
import { remapEngineIds } from "../../utils/remapEngineIds";
import type { DatabaseActor } from "../DatabaseEngine";
import type {
  DatabaseDuplicatedTable,
  DatabaseTablesDuplicate,
  DatabaseTablesDuplicator,
} from "../DatabaseTablesDuplicator";
import { generateEngineId } from "./ids";
import { isLinkField, linkIds, linkValue } from "./links";
import type { OutlineStore } from "./store/OutlineStore";
import type { EngineFieldRow, EngineRecordRow, EngineViewRow } from "./types";
import { engineUserId } from "./users";

/**
 * Duplicates tables of the Outline engine with their fields, views and,
 * optionally, records. Ids of the copied tables, fields, views and records
 * are replaced wherever they appear (options, formulas, filters, positions,
 * link cells), so that a link between two copied tables joins the copies,
 * both ways, with its values. A link to a table left out becomes a one-way
 * link to that table, as in Teable, keeping its values.
 */
export class OutlineTablesDuplicator implements DatabaseTablesDuplicator {
  /**
   * @param store where the tables are kept.
   * @param teamId the team the tables must belong to.
   */
  constructor(
    private readonly store: OutlineStore,
    private readonly teamId?: string
  ) {}

  async duplicateTables(
    actor: DatabaseActor,
    { externalBaseId, tables, withRecords }: DatabaseTablesDuplicate
  ): Promise<DatabaseDuplicatedTable[]> {
    const base = await this.store.base(externalBaseId);
    const sources = tables.map((item) => {
      const snapshot = base.find(
        (candidate) => candidate.table.id === item.externalTableId
      );
      if (!snapshot || (this.teamId && snapshot.table.teamId !== this.teamId)) {
        throw NotFoundError("Table not found");
      }
      return { snapshot, name: item.name };
    });

    const copies = sources.map(({ snapshot }) => ({
      sourceTableId: snapshot.table.id,
      tableId: generateEngineId("tbl"),
      fieldIds: Object.fromEntries(
        snapshot.fields.map((field) => [field.id, generateEngineId("fld")])
      ),
      viewIds: Object.fromEntries(
        snapshot.views.map((view) => [view.id, generateEngineId("viw")])
      ),
      recordIds: withRecords
        ? Object.fromEntries(
            snapshot.records.map((record) => [
              record.id,
              generateEngineId("rec"),
            ])
          )
        : {},
    }));
    const ids: Record<string, string> = {};
    for (const copy of copies) {
      ids[copy.sourceTableId] = copy.tableId;
      Object.assign(ids, copy.fieldIds, copy.viewIds);
    }
    const recordIds: Record<string, string> = Object.assign(
      {},
      ...copies.map((copy) => copy.recordIds)
    );
    const copied = new Set(copies.map((copy) => copy.sourceTableId));
    const now = new Date().toISOString();
    const actorId = engineUserId(actor);

    const results: DatabaseDuplicatedTable[] = [];
    for (const [index, { snapshot, name }] of sources.entries()) {
      const copy = copies[index];
      const fields = snapshot.fields.map((field) =>
        copiedField(field, copy.tableId, ids, copied)
      );
      const oneWayLinks = new Set(
        snapshot.fields
          .filter(
            (field) =>
              isLinkField(field) &&
              !copied.has(field.options.foreignTableId ?? "")
          )
          .map((field) => field.id)
      );
      await this.store.createTable({
        table: {
          id: copy.tableId,
          baseId: snapshot.table.baseId,
          teamId: snapshot.table.teamId,
          name,
        },
        fields,
        views: snapshot.views.map((view) =>
          copiedView(view, copy.tableId, ids)
        ),
        records: withRecords
          ? snapshot.records.map((record) =>
              copiedRecord(record, copy.tableId, {
                ids,
                recordIds,
                oneWayLinks,
                linkFields: snapshot.fields.filter(isLinkField),
                now,
                actorId,
              })
            )
          : [],
      });
      results.push({
        sourceTableId: snapshot.table.id,
        externalTableId: copy.tableId,
        fieldIds: copy.fieldIds,
        viewIds: copy.viewIds,
        recordIds: copy.recordIds,
      });
    }
    return results;
  }
}

function copiedField(
  field: EngineFieldRow,
  tableId: string,
  ids: Record<string, string>,
  copied: ReadonlySet<string>
): EngineFieldRow {
  const foreignTableId = field.options.foreignTableId;
  if (isLinkField(field) && foreignTableId && !copied.has(foreignTableId)) {
    const { symmetricFieldId: _symmetric, ...options } = field.options;
    return {
      ...remapEngineIds(field, ids),
      tableId,
      options: {
        ...remapEngineIds(options, ids),
        foreignTableId,
        isOneWay: true,
      },
    };
  }
  return { ...remapEngineIds(field, ids), tableId };
}

function copiedView(
  view: EngineViewRow,
  tableId: string,
  ids: Record<string, string>
): EngineViewRow {
  return { ...remapEngineIds(view, ids), tableId };
}

function copiedRecord(
  record: EngineRecordRow,
  tableId: string,
  context: {
    ids: Record<string, string>;
    recordIds: Record<string, string>;
    oneWayLinks: ReadonlySet<string>;
    linkFields: EngineFieldRow[];
    now: string;
    actorId: string | null;
  }
): EngineRecordRow {
  const linkFieldIds = new Set(context.linkFields.map((field) => field.id));
  const cells: Record<string, DatabaseCellValue> = {};
  for (const [fieldId, value] of Object.entries(record.cells)) {
    const copiedFieldId = context.ids[fieldId] ?? fieldId;
    if (!linkFieldIds.has(fieldId)) {
      cells[copiedFieldId] = structuredClone(value);
      continue;
    }
    const linked = linkIds(value).map((id) =>
      context.oneWayLinks.has(fieldId) ? id : (context.recordIds[id] ?? id)
    );
    const cell = linkValue(linked);
    if (cell) {
      cells[copiedFieldId] = cell;
    }
  }
  const orders: Record<string, number> = {};
  for (const [viewId, position] of Object.entries(record.orders ?? {})) {
    orders[context.ids[viewId] ?? viewId] = position;
  }
  return {
    id: context.recordIds[record.id] ?? generateEngineId("rec"),
    tableId,
    cells,
    autoNumber: record.autoNumber,
    orders,
    createdTime: context.now,
    lastModifiedTime: context.now,
    createdBy: context.actorId,
    lastModifiedBy: context.actorId,
  };
}

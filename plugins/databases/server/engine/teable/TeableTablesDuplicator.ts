import type { JSONObject, JSONValue } from "@shared/types";
import { toError } from "@shared/utils/error";
import { InternalError } from "@server/errors";
import Logger from "@server/logging/Logger";
import { remapEngineIds } from "../../utils/remapEngineIds";
import type { DatabaseActor } from "../DatabaseEngine";
import type {
  DatabaseDuplicatedTable,
  DatabaseTablesDuplicate,
  DatabaseTablesDuplicator,
} from "../DatabaseTablesDuplicator";
import type { TeableClient, TeableRequest } from "./TeableClient";
import { TeableUnauthorizedError } from "./TeableClient";
import type { TeableIdentity } from "./TeableIdentity";

/**
 * Duplicates Teable tables with Teable's own table duplication, which copies
 * fields, views, formulas and records (each copied record keeps the id of its
 * source, so no record ids are returned) but turns every link to another table
 * into a one-way link to the original table. The links between the tables
 * duplicated together are then pointed at the copies: a two-way pair becomes
 * a two-way pair between the copies again (the copy of the reverse side is
 * replaced by the new symmetric field, under its name), and the lookups and
 * rollups going through those links follow. With records, the values of the
 * repointed links are not carried over.
 */
export class TeableTablesDuplicator implements DatabaseTablesDuplicator {
  /**
   * @param client the transport to Teable.
   * @param identity obtains the actors' tokens.
   */
  constructor(
    private readonly client: TeableClient,
    private readonly identity: TeableIdentity
  ) {}

  async duplicateTables(
    actor: DatabaseActor,
    { externalBaseId, tables, withRecords }: DatabaseTablesDuplicate
  ): Promise<DatabaseDuplicatedTable[]> {
    const copies: TableCopy[] = [];
    for (const table of tables) {
      const sourceFields = await this.call<TeableFieldVo[]>(
        actor,
        externalBaseId,
        {
          method: "GET",
          path: `/api/table/${encode(table.externalTableId)}/field`,
        }
      );
      const copy = await this.call<TeableDuplicatedTableVo>(
        actor,
        externalBaseId,
        {
          method: "POST",
          path: `/api/base/${encode(externalBaseId)}/table/${encode(table.externalTableId)}/duplicate`,
          body: { name: table.name, includeRecords: withRecords },
          timeout: TeableTablesDuplicator.duplicateTimeout,
        }
      );
      copies.push({
        sourceTableId: table.externalTableId,
        tableId: copy.id,
        sourceFields,
        fields: copy.fields ?? [],
        fieldIds: { ...copy.fieldMap },
        viewIds: { ...copy.viewMap },
      });
    }

    await this.relink(actor, externalBaseId, copies);

    return copies.map((copy) => ({
      sourceTableId: copy.sourceTableId,
      externalTableId: copy.tableId,
      fieldIds: copy.fieldIds,
      viewIds: copy.viewIds,
    }));
  }

  private static duplicateTimeout = 120000;

  /**
   * Points the links between the duplicated tables at the copies, then the
   * lookups and rollups that go through them. A failed step is logged and
   * leaves that field pointing at the original table.
   */
  private async relink(
    actor: DatabaseActor,
    baseId: string,
    copies: TableCopy[]
  ) {
    const copyByTable = new Map(
      copies.map((copy) => [copy.sourceTableId, copy])
    );
    const done = new Set<string>();
    const repointed = new Set<string>();
    const replaced: Record<string, string> = {};
    const replacements: FieldReplacement[] = [];

    for (const copy of copies) {
      for (const source of copy.sourceFields) {
        const options = source.options ?? {};
        const foreignTableId = stringOf(options, "foreignTableId");
        const foreign =
          foreignTableId && foreignTableId !== copy.sourceTableId
            ? copyByTable.get(foreignTableId)
            : undefined;
        const copiedId = copy.fieldIds[source.id];
        const crossBase =
          !!stringOf(options, "baseId") &&
          stringOf(options, "baseId") !== baseId;
        if (
          source.type !== "link" ||
          source.isLookup ||
          done.has(source.id) ||
          !foreign ||
          !copiedId ||
          crossBase
        ) {
          continue;
        }
        done.add(source.id);

        const symmetricId = stringOf(options, "symmetricFieldId");
        const twoWay =
          !!symmetricId &&
          options.isOneWay !== true &&
          !!foreign.fieldIds[symmetricId];

        const converted = await this.tryConvert(
          actor,
          baseId,
          copy.tableId,
          copiedId,
          {
            type: "link",
            options: {
              ...remapEngineIds(
                pick(options, linkOptionKeys),
                this.idsOf(copies)
              ),
              foreignTableId: foreign.tableId,
              isOneWay: !twoWay,
            },
          }
        );
        if (!converted) {
          continue;
        }
        repointed.add(copiedId);
        if (!twoWay || !symmetricId) {
          continue;
        }

        done.add(symmetricId);
        const created = stringOf(converted.options ?? {}, "symmetricFieldId");
        const copiedSymmetricId = foreign.fieldIds[symmetricId];
        const symmetricSource = foreign.sourceFields.find(
          (field) => field.id === symmetricId
        );
        if (created && copiedSymmetricId && symmetricSource) {
          foreign.fieldIds[symmetricId] = created;
          replaced[copiedSymmetricId] = created;
          replacements.push({
            tableId: foreign.tableId,
            removedId: copiedSymmetricId,
            fieldId: created,
            name: symmetricSource.name,
            description: symmetricSource.description ?? null,
          });
        }
      }
    }

    const ids = { ...this.idsOf(copies), ...replaced };
    for (const copy of copies) {
      for (const field of copy.fields) {
        const lookup = field.lookupOptions;
        const foreignTableId = lookup
          ? stringOf(lookup, "foreignTableId")
          : undefined;
        const linkFieldId = lookup
          ? stringOf(lookup, "linkFieldId")
          : undefined;
        if (
          !lookup ||
          !foreignTableId ||
          !copyByTable.has(foreignTableId) ||
          (linkFieldId && !repointed.has(linkFieldId) && !replaced[linkFieldId])
        ) {
          continue;
        }
        // A lookup takes its options from the field it looks up; a rollup
        // keeps its own (the expression).
        await this.tryConvert(actor, baseId, copy.tableId, field.id, {
          type: field.type,
          ...(field.isLookup
            ? { isLookup: true }
            : field.options
              ? { options: field.options }
              : {}),
          lookupOptions: remapEngineIds(pick(lookup, lookupOptionKeys), ids),
        });
      }
    }

    for (const replacement of replacements) {
      await this.replaceField(actor, baseId, replacement);
    }
  }

  /** Removes the one-way copy a new symmetric field replaces, and gives the new field its name. */
  private async replaceField(
    actor: DatabaseActor,
    baseId: string,
    { tableId, removedId, fieldId, name, description }: FieldReplacement
  ) {
    try {
      await this.call<void>(actor, baseId, {
        method: "DELETE",
        path: `/api/table/${encode(tableId)}/field/${encode(removedId)}`,
      });
      await this.call<void>(actor, baseId, {
        method: "PATCH",
        path: `/api/table/${encode(tableId)}/field/${encode(fieldId)}`,
        body: { name, description },
      });
    } catch (err) {
      Logger.warn("Could not replace a duplicated link field", {
        tableId,
        fieldId: removedId,
        error: toError(err).message,
      });
    }
  }

  private async tryConvert(
    actor: DatabaseActor,
    baseId: string,
    tableId: string,
    fieldId: string,
    body: JSONObject
  ): Promise<TeableFieldVo | undefined> {
    try {
      return await this.call<TeableFieldVo>(actor, baseId, {
        method: "PUT",
        path: `/api/table/${encode(tableId)}/field/${encode(fieldId)}/convert`,
        body,
      });
    } catch (err) {
      Logger.warn("Could not point a duplicated field at the copies", {
        tableId,
        fieldId,
        error: toError(err).message,
      });
      return undefined;
    }
  }

  /** Every source id of the copies (tables, fields, views) with its copy's id. */
  private idsOf(copies: TableCopy[]): Record<string, string> {
    const ids: Record<string, string> = {};
    for (const copy of copies) {
      ids[copy.sourceTableId] = copy.tableId;
      Object.assign(ids, copy.fieldIds, copy.viewIds);
    }
    return ids;
  }

  /**
   * Calls Teable with the actor's token for the base, asking for a new token
   * once when Teable refuses a cached one.
   */
  private async call<T>(
    actor: DatabaseActor,
    baseId: string,
    request: Omit<TeableRequest, "token">
  ): Promise<T> {
    const token = await this.identity.token(actor, baseId);
    try {
      return await this.client.request<T>({ ...request, token });
    } catch (err) {
      if (!(err instanceof TeableUnauthorizedError)) {
        throw err;
      }
    }

    await this.identity.invalidate(actor, baseId);
    const freshToken = await this.identity.token(actor, baseId);
    try {
      return await this.client.request<T>({ ...request, token: freshToken });
    } catch (err) {
      if (err instanceof TeableUnauthorizedError) {
        throw InternalError("The database engine refused the credentials");
      }
      throw err;
    }
  }
}

/** A Teable field with the options Teable's duplication and conversion read. */
interface TeableFieldVo {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  isLookup?: boolean | null;
  options?: JSONObject | null;
  lookupOptions?: JSONObject | null;
}

/** Teable's IDuplicateTableVo. */
interface TeableDuplicatedTableVo {
  id: string;
  fields?: TeableFieldVo[];
  fieldMap: Record<string, string>;
  viewMap: Record<string, string>;
}

interface TableCopy {
  sourceTableId: string;
  tableId: string;
  sourceFields: TeableFieldVo[];
  /** The fields of the copy as Teable duplicated them. */
  fields: TeableFieldVo[];
  fieldIds: Record<string, string>;
  viewIds: Record<string, string>;
}

interface FieldReplacement {
  tableId: string;
  /** The one-way copy of the reverse side of a pair. */
  removedId: string;
  /** The symmetric field created for the pair between the copies. */
  fieldId: string;
  name: string;
  description: string | null;
}

/** The link options a conversion accepts, besides the table and the direction. */
const linkOptionKeys = [
  "relationship",
  "lookupFieldId",
  "filterByViewId",
  "visibleFieldIds",
  "filter",
];

/** The lookup options a conversion accepts (Teable's lookupOptionsRoSchema). */
const lookupOptionKeys = [
  "foreignTableId",
  "lookupFieldId",
  "linkFieldId",
  "filter",
  "sort",
  "limit",
];

function pick(value: JSONObject, keys: string[]): JSONObject {
  const picked: JSONObject = {};
  for (const key of keys) {
    const item: JSONValue = value[key];
    if (item !== undefined && item !== null) {
      picked[key] = item;
    }
  }
  return picked;
}

function stringOf(value: JSONObject, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" && item ? item : undefined;
}

function encode(id: string) {
  return encodeURIComponent(id);
}

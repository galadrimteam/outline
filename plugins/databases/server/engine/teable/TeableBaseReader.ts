import { InternalError } from "@server/errors";
import fetch from "@server/utils/fetch";
import type { TeableClient, TeableQuery, TeableRequest } from "./TeableClient";
import { TeableUnauthorizedError } from "./TeableClient";
import { TeableIdentity } from "./TeableIdentity";
import type {
  TeableCollaboratorsVo,
  TeableField,
  TeableRecord,
  TeableRecordsVo,
  TeableTableMetaVo,
  TeableView,
} from "./types";

/**
 * Reads everything of a Teable base as it is stored: tables, raw fields and
 * views, records with their system columns, each view's own row order, the
 * people behind user ids, and the files of attachment cells. Never writes.
 */
export interface TeableBaseSource {
  /**
   * Lists the tables of a base.
   *
   * @param baseId the Teable base.
   * @returns the tables, with the time of their last change.
   */
  tables(baseId: string): Promise<TeableTableMetaVo[]>;

  /**
   * Lists the fields of a table in Teable's order (primary field first).
   *
   * @param baseId the Teable base.
   * @param tableId the Teable table.
   * @returns the raw fields.
   */
  fields(baseId: string, tableId: string): Promise<TeableField[]>;

  /**
   * Lists the views of a table.
   *
   * @param baseId the Teable base.
   * @param tableId the Teable table.
   * @returns the raw views.
   */
  views(baseId: string, tableId: string): Promise<TeableView[]>;

  /**
   * Reads every record of a table with every field, keyed by field id.
   *
   * @param baseId the Teable base.
   * @param tableId the Teable table.
   * @returns the records, in auto number order.
   */
  records(baseId: string, tableId: string): Promise<TeableRecord[]>;

  /**
   * Returns the ids of every record of a table in a view's own row order,
   * ignoring the view's filter and sort.
   *
   * @param baseId the Teable base.
   * @param tableId the Teable table.
   * @param viewId the view.
   * @param fieldId a field to read, the smallest projection Teable accepts.
   * @returns the record ids.
   */
  viewRecordIds(
    baseId: string,
    tableId: string,
    viewId: string,
    fieldId: string
  ): Promise<string[]>;

  /**
   * Returns the Teable users known to the base with their email: its
   * collaborators (space members included) and Outline's service account.
   *
   * @param baseId the Teable base.
   * @returns the users.
   */
  users(baseId: string): Promise<TeableUser[]>;

  /**
   * Downloads the file behind an attachment's presigned URL.
   *
   * @param url the presigned URL Teable gave, relative or absolute.
   * @param maxSize the largest file accepted, in bytes.
   * @returns the content and its type.
   * @throws Error when the file cannot be read.
   */
  download(url: string, maxSize: number): Promise<TeableFile>;
}

export interface TeableUser {
  id: string;
  email: string;
  name: string;
}

export interface TeableFile {
  buffer: Buffer;
  contentType: string;
}

/** Reads a Teable base through its REST API, as Outline's service account. */
export class TeableBaseReader implements TeableBaseSource {
  /**
   * @param client the transport to Teable.
   * @param identity obtains the service account's tokens.
   * @param internalUrl the Teable address the server reaches.
   * @param publicUrl the Teable address browsers reach, which attachment URLs may carry.
   */
  constructor(
    private readonly client: TeableClient,
    private readonly identity: TeableIdentity,
    private readonly internalUrl: string,
    private readonly publicUrl?: string
  ) {}

  tables(baseId: string): Promise<TeableTableMetaVo[]> {
    return this.call(baseId, {
      method: "GET",
      path: `/api/base/${encode(baseId)}/table`,
    });
  }

  fields(baseId: string, tableId: string): Promise<TeableField[]> {
    return this.call(baseId, {
      method: "GET",
      path: `/api/table/${encode(tableId)}/field`,
    });
  }

  views(baseId: string, tableId: string): Promise<TeableView[]> {
    return this.call(baseId, {
      method: "GET",
      path: `/api/table/${encode(tableId)}/view`,
    });
  }

  records(baseId: string, tableId: string): Promise<TeableRecord[]> {
    return this.pages(baseId, tableId, { fieldKeyType: "id" });
  }

  async viewRecordIds(
    baseId: string,
    tableId: string,
    viewId: string,
    fieldId: string
  ): Promise<string[]> {
    // Teable orders any record query of a view by the view's own row index,
    // even when the view's filter and sort are ignored.
    const records = await this.pages(baseId, tableId, {
      viewId,
      ignoreViewQuery: "true",
      projection: [fieldId],
      fieldKeyType: "id",
    });
    return records.map((record) => record.id);
  }

  async users(baseId: string): Promise<TeableUser[]> {
    const users: TeableUser[] = [];
    let skip = 0;
    for (;;) {
      const page = await this.call<TeableCollaboratorsVo>(baseId, {
        method: "GET",
        path: `/api/base/${encode(baseId)}/collaborators`,
        query: { skip, take: TeableBaseReader.pageSize },
      });
      for (const item of page.collaborators) {
        if (item.type === "user" && item.userId && item.email) {
          users.push({
            id: item.userId,
            email: item.email,
            name: item.userName ?? item.email,
          });
        }
      }
      skip += page.collaborators.length;
      if (!page.collaborators.length || skip >= page.total) {
        break;
      }
    }

    // The service account exists: the tokens above were issued for it.
    const service = TeableIdentity.serviceUser;
    const ids = await this.identity.ensureUsers([service]);
    const serviceId = ids.get(service.email.toLowerCase());
    if (serviceId) {
      users.push({ id: serviceId, email: service.email, name: service.name });
    }
    return users;
  }

  async download(url: string, maxSize: number): Promise<TeableFile> {
    const internal = this.internalAddress(url);
    const res = await fetch(internal ?? url, {
      method: "GET",
      size: maxSize,
      timeout: TeableBaseReader.downloadTimeout,
      allowPrivateIPAddress: !!internal,
    });
    if (!res.ok) {
      throw new Error(`Teable answered ${res.status} for an attachment`);
    }
    return {
      buffer: await res.buffer(),
      contentType:
        res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  private static pageSize = 1000;

  private static downloadTimeout = 60000;

  private async pages(
    baseId: string,
    tableId: string,
    query: TeableQuery
  ): Promise<TeableRecord[]> {
    const records: TeableRecord[] = [];
    for (let skip = 0; ; skip += TeableBaseReader.pageSize) {
      const page = await this.call<TeableRecordsVo>(baseId, {
        method: "GET",
        path: `/api/table/${encode(tableId)}/record`,
        query: { ...query, take: TeableBaseReader.pageSize, skip },
      });
      records.push(...page.records);
      if (page.records.length < TeableBaseReader.pageSize) {
        return records;
      }
    }
  }

  /** The address the server reads a Teable URL at, or undefined for a URL outside Teable (a storage bucket). */
  private internalAddress(url: string): string | undefined {
    if (url.startsWith("/")) {
      return `${this.internalUrl}${url}`;
    }
    if (this.publicUrl && url.startsWith(`${this.publicUrl}/`)) {
      return `${this.internalUrl}${url.slice(this.publicUrl.length)}`;
    }
    if (url.startsWith(`${this.internalUrl}/`)) {
      return url;
    }
    return undefined;
  }

  /**
   * Calls Teable as the service account with a token for the base, asking for
   * a new token once when Teable refuses a cached one.
   */
  private async call<T>(
    baseId: string,
    request: Omit<TeableRequest, "token">
  ): Promise<T> {
    const token = await this.identity.token("system", baseId);
    try {
      return await this.client.request<T>({ ...request, token });
    } catch (err) {
      if (!(err instanceof TeableUnauthorizedError)) {
        throw err;
      }
    }

    await this.identity.invalidate("system", baseId);
    const freshToken = await this.identity.token("system", baseId);
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

function encode(id: string) {
  return encodeURIComponent(id);
}

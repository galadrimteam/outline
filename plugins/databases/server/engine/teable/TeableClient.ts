import type FormData from "form-data";
import {
  AuthorizationError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@server/errors";
import { toError } from "@shared/utils/error";
import Logger from "@server/logging/Logger";
import fetch from "@server/utils/fetch";

/**
 * The HTTP transport to Teable: JSON in and out, Teable's errors mapped to
 * Outline's. It knows nothing about identities, callers pass the token.
 */
export class TeableClient {
  /**
   * @param baseUrl the Teable address the server reaches, without trailing slash.
   * @param origin echoed by Teable's webhook, so that a writer recognises its own changes.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly origin?: string | null
  ) {}

  /**
   * Sends a request to Teable.
   *
   * @param request the method, path (starting with /api), token, query and body.
   * @returns the parsed JSON response, or null for an empty one.
   * @throws TeableUnauthorizedError when Teable rejects the token.
   * @throws AuthorizationError, NotFoundError, ValidationError or InternalError otherwise.
   */
  async request<T>(request: TeableRequest): Promise<T> {
    const url = `${this.baseUrl}${request.path}${serializeQuery(request.query)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...request.headers,
    };
    if (request.token) {
      headers.Authorization = `Bearer ${request.token}`;
    }
    if (this.origin) {
      headers["x-galadrim-origin"] = this.origin;
    }

    let body: string | FormData | undefined;
    if (request.form) {
      body = request.form;
      Object.assign(headers, request.form.getHeaders());
    } else if (request.body !== undefined) {
      body = JSON.stringify(request.body);
      headers["Content-Type"] = "application/json";
    }

    let response;
    try {
      response = await fetch(url, {
        method: request.method,
        headers,
        body,
        timeout: request.timeout ?? TeableClient.defaultTimeout,
        allowPrivateIPAddress: true,
      });
    } catch (err) {
      Logger.error("Teable request failed", toError(err), {
        method: request.method,
        path: request.path,
      });
      throw InternalError("The database engine is unreachable");
    }

    const text = await response.text();

    if (response.ok) {
      const json = text ? JSON.parse(text) : null;
      return json;
    }

    const message = errorMessage(text) ?? response.statusText;
    switch (response.status) {
      case 401:
        throw new TeableUnauthorizedError(message);
      case 403:
        throw AuthorizationError(message);
      case 404:
        throw NotFoundError(message);
      case 400:
      case 409:
      case 422:
        throw ValidationError(message);
      default:
        Logger.warn("Teable request errored", {
          method: request.method,
          path: request.path,
          status: response.status,
          message,
        });
        throw InternalError("The database engine failed");
    }
  }

  private static defaultTimeout = 30000;
}

/** Teable refused the bearer token (expired, revoked, or of an unknown user). */
export class TeableUnauthorizedError extends Error {
  public readonly name = "TeableUnauthorizedError";
}

export interface TeableRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** The path, starting with /api. */
  path: string;
  token?: string;
  headers?: Record<string, string>;
  query?: TeableQuery;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as multipart, instead of `body`. */
  form?: FormData;
  timeout?: number;
}

export type TeableQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | TeableQueryValue[]
  | { [key: string]: TeableQueryValue };

export type TeableQuery = Record<string, TeableQueryValue>;

/**
 * Serializes a query the way Teable's parser (Express, `qs`) reads it back:
 * `a[]=1&a[]=2` for arrays, `a[b][]=1` for objects. Empty strings are kept,
 * they are meaningful in tuples such as `search`.
 *
 * @param query the query.
 * @returns the query string, with its leading "?", or "".
 */
export function serializeQuery(query?: TeableQuery): string {
  if (!query) {
    return "";
  }
  const parts: string[] = [];
  const append = (key: string, value: TeableQueryValue) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => append(`${key}[]`, item));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([subKey, item]) =>
        append(`${key}[${subKey}]`, item)
      );
      return;
    }
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    );
  };
  Object.entries(query).forEach(([key, value]) => append(key, value));
  return parts.length ? `?${parts.join("&")}` : "";
}

function errorMessage(text: string): string | undefined {
  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === "object" && "message" in json) {
      return typeof json.message === "string" ? json.message : undefined;
    }
  } catch {
    // Not JSON: the status text is used instead.
  }
  return undefined;
}

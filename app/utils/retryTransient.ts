import {
  BadGatewayError,
  NetworkError,
  RateLimitExceededError,
  RequestError,
  ServiceUnavailableError,
} from "./errors";

/** How a call is retried. */
export interface RetryOptions {
  /** How many times the call is made at most. */
  attempts?: number;
  /** The wait in ms before the second call, doubled before each next one. */
  delay?: number;
}

/**
 * Whether an API error may go away by itself: the network, a busy or restarting server, the
 * rate limit. A refused or unknown request is not.
 *
 * @param err the error.
 * @returns true when calling again may succeed.
 */
export function isTransientError(err: unknown): boolean {
  if (
    err instanceof NetworkError ||
    err instanceof BadGatewayError ||
    err instanceof ServiceUnavailableError ||
    err instanceof RateLimitExceededError
  ) {
    return true;
  }
  return err instanceof RequestError && /^Error 5\d\d$/.test(err.message);
}

/**
 * Calls a request again after transient failures, waiting longer each time, for the loads the
 * app makes on its own (the sidebar), which nobody would think of retrying by hand.
 *
 * @param fn the request.
 * @param options the number of attempts and the first wait.
 * @returns what the request resolves to.
 * @throws the last error, or the first one that is not transient.
 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  { attempts = 4, delay = 1000 }: RetryOptions = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isTransientError(err)) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, delay * 2 ** (attempt - 1))
      );
    }
  }
}

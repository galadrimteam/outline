import {
  AuthorizationError,
  NetworkError,
  RateLimitExceededError,
  RequestError,
} from "./errors";
import { isTransientError, retryTransient } from "./retryTransient";

describe("isTransientError", () => {
  it("retries the network, a busy server and the rate limit", () => {
    expect(isTransientError(new NetworkError("down"))).toBe(true);
    expect(isTransientError(new RateLimitExceededError("slow down"))).toBe(
      true
    );
    expect(isTransientError(new RequestError("Error 504"))).toBe(true);
  });

  it("does not retry a refusal or a client error", () => {
    expect(isTransientError(new AuthorizationError("no"))).toBe(false);
    expect(isTransientError(new RequestError("Error 418"))).toBe(false);
    expect(isTransientError(new Error("boom"))).toBe(false);
  });
});

describe("retryTransient", () => {
  it("calls again after a transient failure", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new NetworkError("down"))
      .mockResolvedValueOnce("ok");

    await expect(retryTransient(fn, { delay: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last attempt", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new NetworkError("down"));

    await expect(retryTransient(fn, { attempts: 3, delay: 1 })).rejects.toThrow(
      "down"
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not call again after a refusal", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new AuthorizationError("no"));

    await expect(retryTransient(fn, { delay: 1 })).rejects.toThrow("no");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

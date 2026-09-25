import { Day, Minute } from "@shared/utils/time";
import Logger from "@server/logging/Logger";
import { decrypt, encrypt } from "@server/models/decorators/Encrypted";
import { CacheHelper } from "@server/utils/CacheHelper";
import { hash } from "@server/utils/crypto";
import type { DatabaseActor, DatabaseEngineUserInput } from "../DatabaseEngine";
import type { TeableClient } from "./TeableClient";
import type {
  TeableEnsureUsersVo,
  TeableSpaceVo,
  TeableTokenVo,
} from "./types";

/**
 * Obtains Teable tokens on behalf of Outline users from the fork's
 * `/api/galadrim` endpoints, authenticated by the shared secret. A token acts
 * as the person (history, "Me" filter) with owner rights on one base only, and
 * never leaves the Outline server.
 */
export class TeableIdentity {
  /** The Teable account Outline acts as for background work and new bases. */
  public static readonly serviceUser: DatabaseEngineUserInput = {
    email: "outline@galadrim.local",
    name: "Outline",
  };

  /**
   * @param client the transport to Teable.
   * @param secret the secret shared with the Teable fork.
   * @param configuredSpaceId the space for new bases, when the operator set one.
   */
  constructor(
    private readonly client: TeableClient,
    private readonly secret: string,
    private readonly configuredSpaceId?: string
  ) {}

  /**
   * Returns a token for the actor, scoped to a base, from the cache when a
   * recent one exists.
   *
   * @param actor the person, or "system" for the service account.
   * @param baseId the base the token is scoped to; null for an unscoped token
   * of the service account itself.
   * @returns the bearer token.
   */
  async token(actor: DatabaseActor, baseId: string | null): Promise<string> {
    const key = this.cacheKey(actor, baseId);
    const cached = await CacheHelper.getData<string>(key);
    const token = cached ? this.decryptToken(cached) : undefined;
    if (token) {
      return token;
    }

    // Parallel calls of one request share a single token request.
    const pending = TeableIdentity.inflight.get(key);
    if (pending) {
      return pending;
    }
    const request = this.requestToken(actor, baseId, key);
    TeableIdentity.inflight.set(key, request);
    try {
      return await request;
    } finally {
      TeableIdentity.inflight.delete(key);
    }
  }

  /**
   * Forgets the cached token of an actor, after Teable refused it.
   *
   * @param actor the person, or "system".
   * @param baseId the base the token was scoped to.
   */
  async invalidate(actor: DatabaseActor, baseId: string | null) {
    await CacheHelper.removeData(this.cacheKey(actor, baseId));
  }

  /**
   * Makes sure Teable has an account for each person, without giving them
   * access to anything.
   *
   * @param users the people.
   * @returns the Teable user id of each email, lower-cased.
   */
  async ensureUsers(
    users: DatabaseEngineUserInput[]
  ): Promise<Map<string, string>> {
    if (!users.length) {
      return new Map();
    }
    const res = await this.client.request<TeableEnsureUsersVo>({
      method: "POST",
      path: "/api/galadrim/users/ensure",
      headers: this.secretHeaders(),
      body: { users },
    });
    return new Map(
      res.users.map((user) => [user.email.toLowerCase(), user.id])
    );
  }

  /**
   * Returns the space new bases go in: the configured one, else the space
   * « Outline » the fork keeps for the service account (created on first use).
   *
   * @returns the Teable space id.
   */
  async spaceId(): Promise<string> {
    if (this.configuredSpaceId) {
      return this.configuredSpaceId;
    }
    const spaceId = await CacheHelper.getDataOrSet<string>(
      "databases:teable:space",
      async () => {
        const res = await this.client.request<TeableSpaceVo>({
          method: "POST",
          path: "/api/galadrim/space",
          headers: this.secretHeaders(),
          body: { name: TeableIdentity.spaceName },
        });
        return res.spaceId;
      },
      Day.seconds
    );
    if (!spaceId) {
      throw new Error("Could not resolve the Teable space for new bases");
    }
    return spaceId;
  }

  private static spaceName = "Outline";

  private static inflight = new Map<string, Promise<string>>();

  private async requestToken(
    actor: DatabaseActor,
    baseId: string | null,
    key: string
  ): Promise<string> {
    const user = actor === "system" ? TeableIdentity.serviceUser : actor;
    const res = await this.client.request<TeableTokenVo>({
      method: "POST",
      path: "/api/galadrim/token",
      headers: this.secretHeaders(),
      body: {
        email: user.email,
        name: user.name,
        ...(baseId ? { baseId } : {}),
      },
    });
    await CacheHelper.setData(
      key,
      encrypt(res.token).toString("base64"),
      cacheSeconds(res.expiresAt)
    );
    return res.token;
  }

  private cacheKey(actor: DatabaseActor, baseId: string | null) {
    const email =
      actor === "system" ? TeableIdentity.serviceUser.email : actor.email;
    return `databases:teable:token:${hash(email.toLowerCase())}:${baseId ?? "-"}`;
  }

  private secretHeaders() {
    return { "x-galadrim-secret": this.secret };
  }

  private decryptToken(value: string): string | undefined {
    try {
      return decrypt(Buffer.from(value, "base64"));
    } catch (err) {
      Logger.warn("Could not decrypt a cached Teable token", { err });
      return undefined;
    }
  }
}

/** Tokens live 15 minutes: keep them 12, or less when Teable says so. */
function cacheSeconds(expiresAt: string | number | undefined): number {
  const max = 12 * Minute.seconds;
  if (expiresAt === undefined) {
    return max;
  }
  const expiresMs =
    typeof expiresAt === "number"
      ? expiresAt < 1e12
        ? expiresAt * 1000
        : expiresAt
      : Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return max;
  }
  const remaining =
    Math.floor((expiresMs - Date.now()) / 1000) - Minute.seconds;
  return Math.max(30, Math.min(max, remaining));
}

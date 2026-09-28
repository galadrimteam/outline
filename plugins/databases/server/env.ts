import { IsOptional, IsUrl } from "class-validator";
import { Environment } from "@server/env";
import { Public } from "@server/utils/decorators/Public";
import environment from "@server/utils/environment";
import { CannotUseWithout } from "@server/utils/validators";

const urlOptions = {
  require_tld: false,
  require_protocol: true,
  allow_underscores: true,
  protocols: ["http", "https"],
};

class DatabasesPluginEnvironment extends Environment {
  /**
   * The Teable API as the Outline server reaches it, usually on a private
   * network (for example http://teable:3000). Enables native databases.
   */
  @IsOptional()
  @IsUrl(urlOptions)
  public TEABLE_INTERNAL_URL = this.toOptionalString(
    environment.TEABLE_INTERNAL_URL?.replace(/\/$/, "")
  );

  /**
   * The Teable address a browser reaches, used for attachment links and the
   * admin link to the Teable interface.
   */
  @Public
  @IsOptional()
  @IsUrl(urlOptions)
  public TEABLE_PUBLIC_URL = this.toOptionalString(
    environment.TEABLE_PUBLIC_URL?.replace(/\/$/, "")
  );

  /**
   * Secret shared with the Teable fork: Outline sends it to obtain per-user
   * tokens, Teable sends it back as the bearer of its webhook.
   */
  @IsOptional()
  @CannotUseWithout("TEABLE_INTERNAL_URL")
  public GALADRIM_SECRET = this.toOptionalString(environment.GALADRIM_SECRET);

  /**
   * The Teable space new bases are created in. When unset, the space named
   * « Outline » of the service account is used, and created when missing.
   */
  @IsOptional()
  public TEABLE_SPACE_ID = this.toOptionalString(environment.TEABLE_SPACE_ID);
}

export default new DatabasesPluginEnvironment();

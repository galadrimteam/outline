import env from "../env";
import { engineFor } from ".";
import { OutlineEngine } from "./outline/OutlineEngine";
import { OutlineTablesDuplicator } from "./outline/OutlineTablesDuplicator";
import { tablesDuplicatorFor } from "./tablesDuplicator";

describe("engineFor", () => {
  it("builds the Outline engine without Teable being configured", () => {
    const internalUrl = env.TEABLE_INTERNAL_URL;
    env.TEABLE_INTERNAL_URL = undefined;
    try {
      expect(engineFor({ engine: "outline", teamId: "team" })).toBeInstanceOf(
        OutlineEngine
      );
      expect(
        tablesDuplicatorFor({ engine: "outline", teamId: "team" })
      ).toBeInstanceOf(OutlineTablesDuplicator);
      expect(() => engineFor({ engine: "teable" })).toThrow("not configured");
    } finally {
      env.TEABLE_INTERNAL_URL = internalUrl;
    }
  });

  it("refuses an unknown engine", () => {
    expect(() => engineFor({ engine: "notion" })).toThrow(
      'Unknown database engine "notion"'
    );
  });
});

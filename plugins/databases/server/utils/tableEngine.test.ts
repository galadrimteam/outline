import { engineOfTable } from "./tableEngine";

describe("engineOfTable", () => {
  const store = (owner: string | null) => ({
    tableTeamId: async () => owner,
  });

  it("is the Outline engine when it holds the table for this team", async () => {
    expect(await engineOfTable("team", "tbl1", store("team"))).toBe("outline");
  });

  it("is Teable when the Outline engine does not hold the table", async () => {
    expect(await engineOfTable("team", "tbl1", store(null))).toBe("teable");
    expect(await engineOfTable("team", "tbl1", store("other"))).toBe("teable");
  });

  it("fails rather than guessing when the store cannot be read", async () => {
    const broken = {
      tableTeamId: async (): Promise<string | null> => {
        throw new Error("statement timeout");
      },
    };
    await expect(engineOfTable("team", "tbl1", broken)).rejects.toThrow(
      "statement timeout"
    );
  });
});

import { DatabaseLayout } from "@shared/databases/types";
import { viewPageSize } from "./loadLimit";

describe("viewPageSize", () => {
  it("applies the load limit of an inline list or gallery", () => {
    expect(
      viewPageSize(
        { layout: DatabaseLayout.List, overrides: { loadLimit: 10 } },
        false
      )
    ).toBe(10);
    expect(
      viewPageSize(
        { layout: DatabaseLayout.Gallery, overrides: { loadLimit: 25 } },
        false
      )
    ).toBe(25);
  });

  it("shows 25 cards of an inline gallery whose view names no limit, as Notion", () => {
    expect(
      viewPageSize({ layout: DatabaseLayout.Gallery, overrides: {} }, false)
    ).toBe(25);
    expect(
      viewPageSize({ layout: DatabaseLayout.List, overrides: {} }, false)
    ).toBeUndefined();
    expect(
      viewPageSize({ layout: DatabaseLayout.Gallery, overrides: {} }, true)
    ).toBeUndefined();
  });

  it("loads the default page when the database fills its page", () => {
    expect(
      viewPageSize(
        { layout: DatabaseLayout.List, overrides: { loadLimit: 10 } },
        true
      )
    ).toBeUndefined();
  });

  it("leaves views that load as the reader scrolls alone", () => {
    expect(
      viewPageSize(
        { layout: DatabaseLayout.Table, overrides: { loadLimit: 10 } },
        false
      )
    ).toBeUndefined();
  });
});

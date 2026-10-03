import { vi } from "vitest";
import { openRowComments } from "./openRowComments";

describe("openRowComments", () => {
  it("asks the row's page to show its discussions, then opens it", async () => {
    const ui = { setPageCommentsRequest: vi.fn() };
    const openRow = vi.fn(async () => "secondary" as const);

    await openRowComments(openRow, ui, "rec1");

    expect(openRow).toHaveBeenCalledWith("rec1");
    expect(ui.setPageCommentsRequest).toHaveBeenCalledTimes(1);
    expect(ui.setPageCommentsRequest).toHaveBeenCalledWith("rec1");
  });

  it("withdraws the request when the page could not be opened", async () => {
    const ui = { setPageCommentsRequest: vi.fn() };

    await openRowComments(async () => undefined, ui, "rec1");

    expect(ui.setPageCommentsRequest).toHaveBeenLastCalledWith(null);
  });
});

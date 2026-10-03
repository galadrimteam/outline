import { vi } from "vitest";
import { openRowComments } from "./openRowComments";

describe("openRowComments", () => {
  it("opens the row's page, then the comments of the pane it opened in", async () => {
    const ui = { setRightSidebar: vi.fn() };
    const openRow = vi.fn(async () => "secondary" as const);

    await openRowComments(openRow, ui, "rec1");

    expect(openRow).toHaveBeenCalledWith("rec1");
    expect(ui.setRightSidebar).toHaveBeenCalledWith("comments", "secondary");
  });

  it("leaves the panels alone when the page could not be opened", async () => {
    const ui = { setRightSidebar: vi.fn() };

    await openRowComments(async () => undefined, ui, "rec1");

    expect(ui.setRightSidebar).not.toHaveBeenCalled();
  });
});

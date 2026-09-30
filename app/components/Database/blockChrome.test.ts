import { blockChrome } from "./blockChrome";

describe("blockChrome", () => {
  it("keeps the tabs and toolbar of a full-page database in sight, without a name", () => {
    expect(
      blockChrome({ fullPage: true, hideTitle: false, viewCount: 1 })
    ).toEqual({ showHeading: false, headingAbove: false, reveal: "always" });
  });

  it("puts the name in place of the tab of a single view", () => {
    expect(
      blockChrome({ fullPage: false, hideTitle: false, viewCount: 1 })
    ).toEqual({ showHeading: true, headingAbove: false, reveal: "actions" });
  });

  it("gives the name its own row above several tabs", () => {
    expect(
      blockChrome({ fullPage: false, hideTitle: false, viewCount: 3 })
    ).toEqual({ showHeading: true, headingAbove: true, reveal: "actions" });
  });

  it("shows the tabs of a block without a name on hover only", () => {
    expect(
      blockChrome({ fullPage: false, hideTitle: true, viewCount: 2 })
    ).toEqual({ showHeading: false, headingAbove: false, reveal: "all" });
  });
});

import { blockChrome } from "./blockChrome";

describe("blockChrome", () => {
  it("draws a full-page database without a name", () => {
    expect(
      blockChrome({ fullPage: true, hideTitle: false, viewCount: 1 })
    ).toEqual({ showHeading: false, headingAbove: false });
  });

  it("puts the name in place of the tab of a single view", () => {
    expect(
      blockChrome({ fullPage: false, hideTitle: false, viewCount: 1 })
    ).toEqual({ showHeading: true, headingAbove: false });
  });

  it("gives the name its own row above several tabs", () => {
    expect(
      blockChrome({ fullPage: false, hideTitle: false, viewCount: 3 })
    ).toEqual({ showHeading: true, headingAbove: true });
  });

  it("draws the tabs of a block without a name in place of the name", () => {
    expect(
      blockChrome({ fullPage: false, hideTitle: true, viewCount: 1 })
    ).toEqual({ showHeading: false, headingAbove: false });
  });
});

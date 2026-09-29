import { splitTabs, stripMinimum } from "./viewTabsOverflow";

const metrics = {
  widths: [100, 100, 100, 100, 100],
  gap: 2,
  moreWidth: 60,
  addWidth: 28,
};

describe("splitTabs", () => {
  it("draws every tab when they fit with « + »", () => {
    expect(splitTabs({ ...metrics, available: 538 }, 0)).toEqual({
      visible: [0, 1, 2, 3, 4],
      hidden: [],
    });
  });

  it("keeps room for « N more » and « + » once the tabs overflow", () => {
    // 3 tabs (304) + more (62) + add (30) = 396.
    expect(splitTabs({ ...metrics, available: 400 }, 0)).toEqual({
      visible: [0, 1, 2],
      hidden: [3, 4],
    });
  });

  it("swaps a hidden active tab in place of the last tabs that fit", () => {
    expect(splitTabs({ ...metrics, available: 400 }, 4)).toEqual({
      visible: [0, 1, 4],
      hidden: [2, 3],
    });
  });

  it("makes room for a wide active tab", () => {
    const widths = [100, 100, 100, 100, 250];
    expect(splitTabs({ ...metrics, widths, available: 400 }, 4)).toEqual({
      visible: [4],
      hidden: [0, 1, 2, 3],
    });
  });

  it("always draws the active tab, even when nothing fits", () => {
    expect(splitTabs({ ...metrics, available: 10 }, 2)).toEqual({
      visible: [2],
      hidden: [0, 1, 3, 4],
    });
    expect(splitTabs({ ...metrics, available: 10 }, -1)).toEqual({
      visible: [0],
      hidden: [1, 2, 3, 4],
    });
  });

  it("does not reserve room for « + » when it is not shown", () => {
    expect(
      splitTabs({ ...metrics, addWidth: 0, available: 508 }, 0).hidden
    ).toEqual([]);
  });

  it("handles a database without views", () => {
    expect(splitTabs({ ...metrics, widths: [], available: 0 }, -1)).toEqual({
      visible: [],
      hidden: [],
    });
  });
});

describe("stripMinimum", () => {
  it("keeps room for the active tab, « N more » and « + »", () => {
    const widths = [100, 150.4, 100];
    expect(stripMinimum({ ...metrics, widths, available: 0 }, 1)).toBe(243);
  });

  it("falls back to the first tab and drops what is not shown", () => {
    expect(
      stripMinimum({ ...metrics, widths: [80], addWidth: 0, available: 0 }, -1)
    ).toBe(80);
    expect(stripMinimum({ ...metrics, widths: [], available: 0 }, -1)).toBe(30);
  });
});

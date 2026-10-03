import {
  CONTENTS_PANEL_ATTRIBUTE,
  contentAreaOf,
  measureRightBleed,
  rightBleed,
} from "./rightBleed";

const box = (left: number, width: number) =>
  ({
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 10,
    height: 10,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

describe("rightBleed", () => {
  it("reaches the right edge of the content area, as Notion's wide databases", () => {
    // A narrow page at 1440 px with the sidebar open: text from 482 to 1218.
    expect(rightBleed({ blockRight: 1218, areaRight: 1440 })).toBe(222);
  });

  it("stops before a contents panel on the right of the text", () => {
    expect(
      rightBleed({ blockRight: 1000, areaRight: 1440, contentsLeft: 1184 })
    ).toBe(160);
  });

  it("ignores a contents panel on the left of the text", () => {
    expect(
      rightBleed({ blockRight: 1000, areaRight: 1440, contentsLeft: 300 })
    ).toBe(440);
  });

  it("is never negative", () => {
    expect(rightBleed({ blockRight: 1450, areaRight: 1440 })).toBe(0);
    expect(
      rightBleed({ blockRight: 1000, areaRight: 1440, contentsLeft: 1010 })
    ).toBe(0);
  });
});

describe("measureRightBleed", () => {
  function page({ contents }: { contents?: number } = {}) {
    const area = document.createElement("div");
    area.style.setProperty("--container-width", "1180px");
    const column = document.createElement("div");
    const block = document.createElement("div");
    column.appendChild(block);
    area.appendChild(column);
    area.getBoundingClientRect = () => box(260, 1180);
    Object.defineProperty(area, "clientWidth", { value: 1170 });
    block.getBoundingClientRect = () => box(482, 736);
    if (contents !== undefined) {
      const panel = document.createElement("div");
      panel.setAttribute(CONTENTS_PANEL_ATTRIBUTE, "");
      panel.getBoundingClientRect = () => box(contents, 256);
      area.appendChild(panel);
    }
    return { area, block };
  }

  it("finds the content area the document scene measures", () => {
    const { area, block } = page();
    expect(contentAreaOf(block)).toBe(area);
    expect(contentAreaOf(document.createElement("div"))).toBeUndefined();
  });

  it("measures up to the area's edge, its scrollbar left out", () => {
    const { area, block } = page();
    expect(measureRightBleed(block, area)).toBe(260 + 1170 - 1218);
  });

  it("measures up to a contents panel on the right", () => {
    const { area, block } = page({ contents: 1280 });
    expect(measureRightBleed(block, area)).toBe(1280 - 24 - 1218);
  });
});

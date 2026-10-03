import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRightBleed } from "./useRightBleed";

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

let areaWidth = 1180;

function Probe({
  enabled,
  onResult,
}: {
  enabled: boolean;
  onResult: (bleed: number) => void;
}) {
  const [block, setBlock] = React.useState<HTMLDivElement | null>(null);
  const areaRef = React.useCallback((area: HTMLDivElement | null) => {
    if (area) {
      area.getBoundingClientRect = () => box(260, areaWidth);
      Object.defineProperty(area, "clientWidth", {
        configurable: true,
        get: () => areaWidth,
      });
    }
  }, []);
  const blockRef = React.useCallback((element: HTMLDivElement | null) => {
    if (element) {
      element.getBoundingClientRect = () => box(482, 736);
    }
    setBlock(element);
  }, []);
  onResult(useRightBleed(block, enabled));
  return (
    <div
      ref={areaRef}
      style={{ "--container-width": "1180px" } as React.CSSProperties}
    >
      <div ref={blockRef} />
    </div>
  );
}

describe("useRightBleed", () => {
  let container: HTMLDivElement;
  let root: Root;
  let result = -1;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    areaWidth = 1180;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (enabled: boolean) =>
    act(async () => {
      root.render(
        <Probe enabled={enabled} onResult={(next) => (result = next)} />
      );
    });

  it("gives a block mounted after the first render the room up to the page's edge", async () => {
    await render(true);
    expect(result).toBe(260 + 1180 - 1218);
  });

  it("follows the window when it is resized", async () => {
    await render(true);
    areaWidth = 1000;
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result).toBe(260 + 1000 - 1218);
  });

  it("gives no room to a block out of the page's flow", async () => {
    await render(false);
    expect(result).toBe(0);
  });
});

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useIsWrapped } from "./useIsWrapped";

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function Probe({
  lead,
  item,
  onResult,
}: {
  lead: DOMRect;
  item: DOMRect;
  onResult: (wrapped: boolean) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const leadRef = React.useRef<HTMLDivElement>(null);
  const itemRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (leadRef.current && itemRef.current) {
      leadRef.current.getBoundingClientRect = () => lead;
      itemRef.current.getBoundingClientRect = () => item;
    }
  });
  const wrapped = useIsWrapped(containerRef, leadRef, itemRef);
  onResult(wrapped);
  return (
    <div ref={containerRef}>
      <div ref={leadRef} />
      <div ref={itemRef} />
    </div>
  );
}

describe("useIsWrapped", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function wrappedFor(lead: DOMRect, item: DOMRect) {
    let result = false;
    await act(async () => {
      root.render(
        <Probe lead={lead} item={item} onResult={(next) => (result = next)} />
      );
    });
    return result;
  }

  it("is false while the item sits on the line of the lead item", async () => {
    expect(await wrappedFor(rect(0, 36), rect(4, 28))).toBe(false);
  });

  it("is true once the item went below the lead item", async () => {
    expect(await wrappedFor(rect(0, 36), rect(36, 36))).toBe(true);
  });

  it("is false before layout, when nothing has a size", async () => {
    expect(await wrappedFor(rect(0, 0), rect(0, 0))).toBe(false);
  });
});

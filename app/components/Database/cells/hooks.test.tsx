import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { useListNavigation } from "./hooks";

function Picker({
  query,
  withSearch,
  onPick,
  onEnterWithoutPick,
}: {
  query: string;
  withSearch: boolean;
  onPick: (index: number) => void;
  onEnterWithoutPick: () => void;
}) {
  const { active, handleKeyDown } = useListNavigation(
    3,
    onPick,
    withSearch ? { query, onEnterWithoutPick } : undefined
  );
  return <input data-active={active} onKeyDown={handleKeyDown} readOnly />;
}

describe("useListNavigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onPick = vi.fn();
  const onEnterWithoutPick = vi.fn();

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onPick.mockReset();
    onEnterWithoutPick.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (query: string, withSearch = true) =>
    act(async () => {
      root.render(
        <Picker
          query={query}
          withSearch={withSearch}
          onPick={onPick}
          onEnterWithoutPick={onEnterWithoutPick}
        />
      );
    });

  const input = () => container.querySelector("input") as HTMLInputElement;
  const press = (key: string, init: KeyboardEventInit = {}) =>
    act(async () => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...init })
      );
    });

  it("opens with nothing highlighted: the first Enter picks nothing", async () => {
    await render("");
    expect(input().dataset.active).toBe("-1");
    await press("Enter");
    expect(onPick).not.toHaveBeenCalled();
    expect(onEnterWithoutPick).toHaveBeenCalledTimes(1);
  });

  it("picks what the arrows highlight", async () => {
    await render("");
    await press("ArrowUp");
    expect(input().dataset.active).toBe("2");
    await press("ArrowDown");
    await press("ArrowDown");
    await press("Enter");
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("highlights the first match once the reader types", async () => {
    await render("");
    await render("ter");
    await press("Enter");
    expect(onPick).toHaveBeenCalledWith(0);
  });

  it("does not repeat a pick while Enter is held", async () => {
    await render("a");
    await press("Enter", { repeat: true });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("highlights the first item from the start without a search", async () => {
    await render("", false);
    expect(input().dataset.active).toBe("0");
    await press("Enter");
    expect(onPick).toHaveBeenCalledWith(0);
  });
});

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { light } from "@shared/styles/theme";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import { dropPlacement, useDropAnchor } from "./dropPlacement";

const header = { left: 1053, top: 166, width: 200, height: 36 };
const MENU_HEIGHT = 444;

describe("dropPlacement", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      1440
    );
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
      900
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const rect =
          this.tagName === "BUTTON"
            ? header
            : { left: 0, top: 0, width: 0, height: 0 };
        return {
          ...rect,
          x: rect.left,
          y: rect.top,
          right: rect.left + rect.width,
          bottom: rect.top + rect.height,
          toJSON: () => rect,
        };
      }
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return isPopover(this) ? MENU_HEIGHT : 0;
      }
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return isPopover(this) ? 260 : 0;
      }
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function isPopover(element: HTMLElement) {
    return element.hasAttribute("data-radix-popper-content-wrapper");
  }

  function HeaderMenu() {
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const { anchorRef, size } = useDropAnchor(triggerRef, true);
    return (
      <Popover open>
        <PopoverTrigger ref={triggerRef}>
          <button type="button">Epic</button>
        </PopoverTrigger>
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          aria-label="Property menu"
          width={260}
          {...dropPlacement(size, size.height)}
        >
          menu
        </PopoverContent>
      </Popover>
    );
  }

  async function openUnderHeader() {
    await act(async () => {
      root.render(
        <ThemeProvider theme={light}>
          <HeaderMenu />
        </ThemeProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return document.querySelector<HTMLElement>('[aria-label="Property menu"]')
      ?.parentElement?.style.transform;
  }

  it("opens a menu right under its header, from its left edge", async () => {
    header.top = 166;
    expect(await openUnderHeader()).toBe("translate(1053px, 202px)");
  });

  it("moves the menu up over its header rather than above it when the window lacks room", async () => {
    header.top = 448;
    expect(await openUnderHeader()).toBe(
      `translate(1053px, ${900 - MENU_HEIGHT}px)`
    );
  });

  it("ends the menu where the header leaves the window when it would not fit", async () => {
    header.top = 166;
    header.left = 1253;
    expect(await openUnderHeader()).toBe("translate(1180px, 202px)");
    header.left = 1053;
  });
});

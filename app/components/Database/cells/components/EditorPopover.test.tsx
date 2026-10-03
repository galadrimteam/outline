import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { light } from "@shared/styles/theme";
import { EditorPopover, cellHostProps } from "./EditorPopover";

const host = { left: 529, top: 315, width: 551, height: 38 };

describe("EditorPopover", () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function open(withHost: boolean) {
    await act(async () => {
      root.render(
        <ThemeProvider theme={light}>
          <div {...(withHost ? cellHostProps : {})} data-testid="host">
            <EditorPopover
              anchor={<span>Contrôles</span>}
              label="Edit options"
              onClose={() => undefined}
            >
              <input aria-label="Search" />
            </EditorPopover>
          </div>
        </ThemeProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return document.querySelector<HTMLElement>('[aria-label="Edit options"]');
  }

  beforeEach(() => {
    host.width = 551;
    host.top = 315;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const rect =
          this.dataset.testid === "host"
            ? host
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function placeIn(window: { width: number; height: number }) {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      window.width
    );
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
      window.height
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return isPopover(this) ? 368 : 0;
      }
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return isPopover(this) ? Math.max(300, host.width) : 0;
      }
    );
  }

  function isPopover(element: HTMLElement) {
    return element.hasAttribute("data-radix-popper-content-wrapper");
  }

  function translation(popover: HTMLElement | null) {
    return popover?.parentElement?.style.transform;
  }

  it("puts its top left corner on the cell's", async () => {
    host.width = 200;
    host.top = 312;
    placeIn({ width: 1440, height: 900 });
    expect(translation(await open(true))).toBe("translate(529px, 312px)");
  });

  it("moves up over the cell when the window lacks room below", async () => {
    host.width = 200;
    host.top = 800;
    placeIn({ width: 1440, height: 900 });
    expect(translation(await open(true))).toBe("translate(529px, 532px)");
  });

  it("opens over the cell that hosts it, as wide as the cell when it is wider", async () => {
    const popover = await open(true);
    expect(popover).not.toBeNull();
    expect(popover && getComputedStyle(popover).width).toBe("551px");
    expect(
      popover?.parentElement?.style.getPropertyValue(
        "--radix-popper-anchor-width"
      )
    ).toBe("551px");
  });

  it("keeps its own width over a narrow cell", async () => {
    host.width = 200;
    const popover = await open(true);
    expect(popover && getComputedStyle(popover).width).toBe("300px");
  });

  it("opens over what it draws when no cell hosts it", async () => {
    const popover = await open(false);
    expect(
      popover?.parentElement?.style.getPropertyValue(
        "--radix-popper-anchor-width"
      )
    ).toBe("0px");
  });
});

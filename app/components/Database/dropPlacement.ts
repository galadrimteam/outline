import * as React from "react";

/** The Radix popover props of a popover opened from an anchor's left edge. */
export interface DropPlacement {
  side: "right";
  align: "start";
  sideOffset: number;
  alignOffset: number;
  sticky: "always";
}

/** The size of an anchor. */
export interface AnchorSize {
  width: number;
  height: number;
}

/** An anchor as the popover measures it, the element whose scrolling it follows included. */
export interface ClippedAnchor {
  getBoundingClientRect: () => DOMRect;
  contextElement: HTMLElement;
}

/**
 * Where a popover goes to start at the left edge of its anchor, `top` pixels below the anchor's
 * top, as Notion opens its menus and editors: placed on the anchor's right and pulled back by its
 * width, so that the window's edges move it up or down, over the anchor, instead of turning it
 * over above it. Too wide for the window, it ends at the anchor's right edge instead.
 *
 * @param anchor the size of the anchor.
 * @param top distance from the anchor's top to the popover's: 0 to cover the anchor.
 * @returns the popover props.
 */
export function dropPlacement(anchor: AnchorSize, top: number): DropPlacement {
  return {
    side: "right",
    align: "start",
    sideOffset: -anchor.width,
    alignOffset: top,
    sticky: "always",
  };
}

/**
 * The part of an element within the window's width: a table cell scrolled past the edge of the
 * window anchors its popover on what can be seen of it.
 *
 * @param element the element.
 * @returns the anchor to give the popover.
 */
export function clippedAnchor(element: HTMLElement): ClippedAnchor {
  return {
    contextElement: element,
    getBoundingClientRect: () => {
      const rect = element.getBoundingClientRect();
      const left = Math.max(rect.left, 0);
      const right = Math.max(
        Math.min(
          rect.right,
          document.documentElement.clientWidth || rect.right
        ),
        left
      );
      return {
        x: left,
        y: rect.top,
        left,
        right,
        top: rect.top,
        bottom: rect.bottom,
        width: right - left,
        height: rect.height,
        toJSON: () => ({ left, right, top: rect.top, bottom: rect.bottom }),
      };
    },
  };
}

/**
 * The anchor of a popover opened from an element, and its size, read when `active` turns true.
 *
 * @param ref the element.
 * @param active whether the popover is open.
 * @returns the anchor to give the popover and its size, zero until read.
 */
export function useDropAnchor(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean
): { anchorRef: React.RefObject<ClippedAnchor | null>; size: AnchorSize } {
  const anchorRef = React.useRef<ClippedAnchor | null>(null);
  const [size, setSize] = React.useState<AnchorSize>({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) {
      return;
    }
    const anchor = clippedAnchor(element);
    anchorRef.current = anchor;
    const rect = anchor.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
  }, [ref, active]);

  return { anchorRef, size };
}

import * as React from "react";
import { contentAreaOf, measureRightBleed } from "./rightBleed";

/**
 * Keeps {@link measureRightBleed} of a block up to date as the block, its
 * content area or the window change size.
 *
 * @param block the block, null until it is mounted.
 * @param enabled whether the block may reach right of its text column.
 * @returns the width in pixels, 0 when disabled or outside of a document.
 */
export function useRightBleed(
  block: HTMLElement | null,
  enabled: boolean
): number {
  const [bleed, setBleed] = React.useState(0);

  React.useLayoutEffect(() => {
    const area = block && enabled ? contentAreaOf(block) : undefined;
    if (!block || !area) {
      return;
    }

    const measure = () => setBleed(measureRightBleed(block, area));
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(block);
    observer?.observe(area);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [block, enabled]);

  return enabled ? bleed : 0;
}

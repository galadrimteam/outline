import * as React from "react";
import type { TabStripMetrics } from "./viewTabsOverflow";

interface Options {
  /** The space between two items of the strip. */
  gap: number;
  /** The width of the « + » button, 0 when it is not shown. */
  addWidth: number;
}

/**
 * Measures the view tab strip: its room and the natural width of each tab
 * and of the « N more » button. The widths are read from a hidden copy of
 * every tab, so that a tab moved to the « N more » menu comes back when the
 * room grows.
 *
 * @param options the gap and the width of « + ».
 * @returns a ref for the strip, a ref for the hidden copy (one child per tab,
 * then the « N more » button) and the metrics once measured.
 */
export function useTabStripMetrics({ gap, addWidth }: Options) {
  const stripRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = React.useState<TabStripMetrics>();

  const measure = React.useCallback(() => {
    const strip = stripRef.current;
    const copy = measureRef.current;
    if (!strip || !copy) {
      return;
    }
    const widths = Array.from(copy.children).map(
      (child) => child.getBoundingClientRect().width
    );
    const moreWidth = widths.pop() ?? 0;
    const next: TabStripMetrics = {
      widths,
      available: strip.getBoundingClientRect().width,
      gap,
      moreWidth,
      addWidth,
    };
    setMetrics((current) =>
      current && sameMetrics(current, next) ? current : next
    );
  }, [gap, addWidth]);

  // Every render may rename, add or remove a tab: measure before paint.
  React.useLayoutEffect(measure);

  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    for (const node of [stripRef.current, measureRef.current]) {
      if (node) {
        observer.observe(node);
      }
    }
    return () => observer.disconnect();
  }, [measure]);

  return { stripRef, measureRef, metrics };
}

function sameMetrics(a: TabStripMetrics, b: TabStripMetrics): boolean {
  return (
    a.available === b.available &&
    a.gap === b.gap &&
    a.moreWidth === b.moreWidth &&
    a.addWidth === b.addWidth &&
    a.widths.length === b.widths.length &&
    a.widths.every((width, index) => width === b.widths[index])
  );
}

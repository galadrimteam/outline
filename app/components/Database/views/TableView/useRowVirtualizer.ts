import type { VirtualItem } from "@tanstack/react-virtual";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";

/** What the table needs from a virtualizer, whatever scrolls it. */
export interface RowVirtualizer {
  items: VirtualItem[];
  totalSize: number;
  /** Offset of the rows container in its scroller; row positions include it. */
  scrollMargin: number;
  measureElement: (element: Element | null) => void;
  scrollToIndex: (index: number) => void;
}

interface Params {
  count: number;
  estimateSize: (index: number) => number;
  getItemKey: (index: number) => string;
  /** The element holding the rows. */
  containerRef: React.RefObject<HTMLElement>;
}

/**
 * Virtualizes the rows of a table that scrolls with its page: the window in a normal document,
 * the pane of a split view otherwise. Only the rows on screen are rendered.
 *
 * @param params the row count, sizes and keys, and the rows container.
 * @returns the rows to render and their positions.
 */
export function useRowVirtualizer({
  count,
  estimateSize,
  getItemKey,
  containerRef,
}: Params): RowVirtualizer {
  const [scroller, setScroller] = React.useState<HTMLElement | null>(null);
  const [isWindow, setIsWindow] = React.useState(true);
  const [scrollMargin, setScrollMargin] = React.useState(0);

  React.useLayoutEffect(() => {
    const parent = findScrollParent(containerRef.current);
    setScroller(parent);
    setIsWindow(!parent);
  }, [containerRef]);

  const measureMargin = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const top = container.getBoundingClientRect().top;
    const margin = scroller
      ? top - scroller.getBoundingClientRect().top + scroller.scrollTop
      : top + window.scrollY;
    setScrollMargin((current) =>
      Math.abs(current - margin) < 1 ? current : Math.round(margin)
    );
  }, [containerRef, scroller]);

  React.useLayoutEffect(measureMargin);

  React.useEffect(() => {
    const observed = scroller?.firstElementChild ?? document.body;
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measureMargin);
    observer?.observe(observed);
    window.addEventListener("resize", measureMargin);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureMargin);
    };
  }, [measureMargin, scroller]);

  const common = {
    count,
    estimateSize,
    getItemKey,
    overscan: 8,
    scrollMargin,
  };
  const elementVirtualizer = useVirtualizer({
    ...common,
    enabled: !isWindow,
    getScrollElement: () => scroller,
  });
  const windowVirtualizer = useWindowVirtualizer({
    ...common,
    enabled: isWindow,
  });

  const virtualizer = isWindow ? windowVirtualizer : elementVirtualizer;
  return {
    items: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    scrollMargin,
    measureElement: virtualizer.measureElement,
    scrollToIndex: (index: number) =>
      virtualizer.scrollToIndex(index, { align: "auto" }),
  };
}

/**
 * The nearest ancestor that scrolls vertically (a split view pane), or null when the window does.
 * Ancestors that scroll sideways only, like the table's own horizontal scroller, are skipped.
 *
 * @param element where to start.
 * @returns the scrolling ancestor, or null for the window.
 */
function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const scrollsY = /(auto|scroll|overlay)/.test(style.overflowY);
    const scrollsX = /(auto|scroll|overlay)/.test(style.overflowX);
    if (scrollsY && !scrollsX) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

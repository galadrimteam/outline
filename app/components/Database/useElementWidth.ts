import * as React from "react";

/**
 * The width of an element, read when it mounts and whenever it is resized.
 *
 * @param ref the element.
 * @returns its width in pixels, 0 until it is measured or where it cannot be.
 */
export function useElementWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

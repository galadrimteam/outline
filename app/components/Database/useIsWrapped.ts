import * as React from "react";

/**
 * Whether a flex item went to a line below another one of the same wrapping
 * container, read after every render and when the container is resized.
 *
 * @param containerRef the wrapping flex container.
 * @param leadRef the item on the first line.
 * @param itemRef the item that may wrap.
 * @returns true when the item is below the lead item.
 */
export function useIsWrapped(
  containerRef: React.RefObject<HTMLElement>,
  leadRef: React.RefObject<HTMLElement>,
  itemRef: React.RefObject<HTMLElement>
): boolean {
  const [wrapped, setWrapped] = React.useState(false);

  const measure = React.useCallback(() => {
    const lead = leadRef.current?.getBoundingClientRect();
    const item = itemRef.current?.getBoundingClientRect();
    setWrapped(
      !!lead && !!item && lead.height > 0 && item.top >= lead.bottom - 1
    );
  }, [leadRef, itemRef]);

  React.useLayoutEffect(measure);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  return wrapped;
}

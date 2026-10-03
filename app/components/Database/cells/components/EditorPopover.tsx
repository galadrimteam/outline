import * as React from "react";
import styled from "styled-components";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "~/components/primitives/Popover";

/**
 * Props marking the element a cell editor opens over: a table cell, the value of a page
 * property, a property of a card. Without one, the editor opens over what it draws in place of
 * the value.
 */
export const cellHostProps = { "data-cell-host": "" } as const;

interface Props {
  /** What stays drawn in the cell while the popover is open, usually the renderer. */
  anchor: React.ReactNode;
  /** The editor itself. */
  children: React.ReactNode;
  /** Accessible name of the popover. */
  label: string;
  /** Called when the popover is dismissed (Escape, click outside). */
  onClose: () => void;
  /** Least width of the popover; it is never narrower than its cell. */
  width?: number;
}

/**
 * A popover editor laid over its cell as in Notion, always open while mounted: its top left
 * corner on the cell's, at least as wide as the cell, and moved up rather than turned over when
 * the window lacks room below. The host mounts it to start editing and unmounts it when
 * `onClose` is called.
 *
 * @param props the anchor, the editor and the close callback.
 * @returns the anchored popover.
 */
export function EditorPopover({
  anchor,
  children,
  label,
  onClose,
  width = 300,
}: Props) {
  const hostRef = React.useRef<HTMLElement | null>(null);
  const [hostWidth, setHostWidth] = React.useState(0);

  const handleAnchorRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      hostRef.current =
        element?.closest<HTMLElement>("[data-cell-host]") ?? element;
    },
    []
  );

  React.useLayoutEffect(() => {
    setHostWidth(hostRef.current?.getBoundingClientRect().width ?? 0);
  }, []);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  // Placed on the right of the cell and pulled back by its width, the popover starts on the
  // cell: on that side the window's edges shift it up and down instead of flipping it over.
  return (
    <Popover open onOpenChange={handleOpenChange}>
      <Anchor ref={handleAnchorRef}>{anchor}</Anchor>
      <PopoverAnchor virtualRef={hostRef} />
      <Content
        aria-label={label}
        width={Math.max(width, Math.ceil(hostWidth))}
        side="right"
        align="start"
        sideOffset={-hostWidth}
        sticky="always"
        shrink
        scrollable={false}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        {children}
      </Content>
    </Popover>
  );
}

const Anchor = styled.div`
  width: 100%;
  min-width: 0;
`;

const Content = styled(PopoverContent)`
  padding: 0;
  overflow: hidden;
`;

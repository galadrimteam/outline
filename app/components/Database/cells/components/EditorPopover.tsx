import * as React from "react";
import styled from "styled-components";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "~/components/primitives/Popover";

interface Props {
  /** What stays drawn in the cell while the popover is open, usually the renderer. */
  anchor: React.ReactNode;
  /** The editor itself. */
  children: React.ReactNode;
  /** Accessible name of the popover. */
  label: string;
  /** Called when the popover is dismissed (Escape, click outside). */
  onClose: () => void;
  /** Width of the popover. */
  width?: number;
}

/**
 * A popover editor anchored on its cell, always open while mounted: the host mounts it to start
 * editing and unmounts it when `onClose` is called.
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
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    // The host moves focus back to its own cell; Radix would focus the anchor's first button.
    event.preventDefault();
  }, []);

  return (
    <Popover open onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <Anchor>{anchor}</Anchor>
      </PopoverAnchor>
      <Content
        aria-label={label}
        width={width}
        side="bottom"
        align="start"
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

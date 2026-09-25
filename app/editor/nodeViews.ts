import type { FunctionComponent } from "react";
import type { ComponentProps } from "@shared/editor/types";
import { DatabaseBlock } from "~/components/Database/DatabaseBlock";

/** A React view supplied by the app for a node whose shared definition has none. */
export interface NodeViewOverride {
  /** Renders the node. */
  component: FunctionComponent<ComponentProps>;
  /** Which events ProseMirror must leave to the view; the default rule otherwise. */
  stopEvent?: (event: Event) => boolean;
}

/**
 * App views of nodes, by node name, used by every editor instance. A database
 * handles its own clicks, keys and drags: without `stopEvent` a click in a
 * cell would select the node and a card drag would drop content in the page.
 */
export const nodeViewOverrides: Record<string, NodeViewOverride | undefined> = {
  database: { component: DatabaseBlock, stopEvent: () => true },
};

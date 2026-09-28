import type { DatabaseEngineViewType } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";

/**
 * Returns the layout an engine view type is drawn with, before overrides.
 *
 * @param type the engine view type.
 * @returns the layout.
 */
export function layoutForViewType(
  type: DatabaseEngineViewType
): DatabaseLayout {
  switch (type) {
    case "kanban":
      return DatabaseLayout.Board;
    case "calendar":
      return DatabaseLayout.Calendar;
    case "gallery":
      return DatabaseLayout.Gallery;
    case "form":
      return DatabaseLayout.Form;
    default:
      return DatabaseLayout.Table;
  }
}

/**
 * Returns the engine view type a layout is stored as. List and timeline are
 * grid views that Outline draws differently (`overrides.layout`).
 *
 * @param layout the layout.
 * @returns the engine view type.
 */
export function viewTypeForLayout(
  layout: DatabaseLayout
): DatabaseEngineViewType {
  switch (layout) {
    case DatabaseLayout.Board:
      return "kanban";
    case DatabaseLayout.Calendar:
      return "calendar";
    case DatabaseLayout.Gallery:
      return "gallery";
    case DatabaseLayout.Form:
      return "form";
    default:
      return "grid";
  }
}

/**
 * Tells whether a layout is drawn by Outline over an engine grid view.
 *
 * @param layout the layout.
 * @returns true for list and timeline.
 */
export function isOverlayLayout(
  layout: DatabaseLayout
): layout is DatabaseLayout.List | DatabaseLayout.Timeline {
  return layout === DatabaseLayout.List || layout === DatabaseLayout.Timeline;
}

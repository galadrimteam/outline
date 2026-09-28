import { BulletedListIcon, CalendarIcon, TableIcon } from "outline-icons";
import { DatabaseLayout } from "@shared/databases/types";

interface Props {
  /** The layout drawn. */
  layout: DatabaseLayout;
  /** Size in pixels, 24 like outline-icons by default. */
  size?: number;
  color?: string;
}

/**
 * The icon of a view layout (table, board, calendar…), used in view tabs and
 * in the block menu.
 *
 * @param props the layout, size and colour.
 * @returns the icon.
 */
export function LayoutIcon({
  layout,
  size = 24,
  color = "currentColor",
}: Props) {
  switch (layout) {
    case DatabaseLayout.Table:
      return <TableIcon size={size} color={color} />;
    case DatabaseLayout.Calendar:
      return <CalendarIcon size={size} color={color} />;
    case DatabaseLayout.List:
      return <BulletedListIcon size={size} color={color} />;
    case DatabaseLayout.Board:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...outline(color)}>
          <rect x="4.75" y="5.75" width="4" height="12.5" rx="1.25" />
          <rect x="10.75" y="5.75" width="4" height="8.5" rx="1.25" />
          <rect x="16.75" y="5.75" width="3" height="10.5" rx="1.25" />
        </svg>
      );
    case DatabaseLayout.Gallery:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...outline(color)}>
          <rect x="4.75" y="5.75" width="6" height="5.5" rx="1.25" />
          <rect x="13.25" y="5.75" width="6" height="5.5" rx="1.25" />
          <rect x="4.75" y="13.75" width="6" height="5.5" rx="1.25" />
          <rect x="13.25" y="13.75" width="6" height="5.5" rx="1.25" />
        </svg>
      );
    case DatabaseLayout.Timeline:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <rect x="4.5" y="6" width="9" height="3" rx="1.5" />
          <rect x="9" y="10.5" width="10.5" height="3" rx="1.5" />
          <rect x="6.5" y="15" width="7.5" height="3" rx="1.5" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...outline(color)}>
          <rect x="6.25" y="4.75" width="11.5" height="14.5" rx="1.75" />
          <path d="M9.5 9h5M9.5 12h5M9.5 15h3" strokeLinecap="round" />
        </svg>
      );
  }
}

function outline(color: string) {
  return { fill: "none", stroke: color, strokeWidth: 1.5 };
}

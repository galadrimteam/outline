import Icon from "@shared/components/Icon";
import type { DatabaseView } from "@shared/databases/types";
import { determineIconType } from "@shared/utils/icon";
import { LayoutIcon } from "./LayoutIcon";

interface Props {
  /** The view drawn. */
  view: DatabaseView;
  /** Size in pixels, 24 like outline-icons by default. */
  size?: number;
}

/**
 * The icon of a view: the one chosen for it, like the icon of a Notion view,
 * else the icon of its layout. Icons of the library take the text colour.
 *
 * @param props the view and the size.
 * @returns the icon.
 */
export function ViewIcon({ view, size = 24 }: Props) {
  const icon = view.overrides.icon;
  if (icon && determineIconType(icon)) {
    return (
      <Icon
        value={icon}
        size={size}
        color="currentColor"
        initial={view.name.charAt(0)}
      />
    );
  }
  return <LayoutIcon layout={view.layout} size={size} />;
}

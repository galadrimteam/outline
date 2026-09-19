import { observer } from "mobx-react";
import { getLuminance } from "polished";
import styled, { css } from "styled-components";
import breakpoint from "styled-components-breakpoint";
import useStores from "../hooks/useStores";
import { IconType } from "../types";
import { IconLibrary } from "../utils/IconLibrary";
import { colorPalette } from "../constants";
import { determineIconType } from "../utils/icon";
import EmojiIcon from "./EmojiIcon";
import Flex from "./Flex";
import { CustomEmoji } from "./CustomEmoji";

export type Props = {
  /** The icon to render */
  value: string;
  /** The color of the icon */
  color?: string;
  /** The size of the icon */
  size?: number;
  /** The initial to display if the icon is a letter icon */
  initial: string;
  /** Optional additional class name */
  className?: string;
  /**
   * Ensure the color does not change in response to theme and contrast. Should only be
   * used in color picker UI.
   */
  forceColor?: boolean;
};

const Icon = ({
  value: icon,
  color,
  size = 24,
  initial,
  forceColor,
  className,
}: Props) => {
  const iconType = determineIconType(icon);

  if (!iconType) {
    // Logger.warn("Failed to determine icon type", {
    //   icon,
    // });
    return null;
  }

  try {
    if (iconType === IconType.SVG) {
      return (
        <SVGIcon
          value={icon}
          color={color}
          size={size}
          initial={initial}
          className={className}
          forceColor={forceColor}
        />
      );
    }

    if (iconType === IconType.Custom) {
      return (
        <Span size={size} className={className}>
          <CustomEmoji value={icon} size={size - size / 4} />
        </Span>
      );
    }

    return <EmojiIcon emoji={icon} size={size} className={className} />;
  } catch (_err) {
    // Ignore
  }

  return null;
};

const SVGIcon = observer(
  ({
    value: icon,
    color: inputColor,
    initial,
    size,
    className,
    forceColor,
  }: Props) => {
    const { ui } = useStores();
    let color = inputColor ?? colorPalette[0];

    // If the chosen icon color is very dark then we invert it in dark mode
    if (!forceColor) {
      if (ui.resolvedTheme === "dark" && color !== "currentColor") {
        color = getLuminance(color) > 0.09 ? color : "currentColor";
      }

      // If the chosen icon color is very light then we invert it in light mode
      if (ui.resolvedTheme === "light" && color !== "currentColor") {
        color = getLuminance(color) < 0.9 ? color : "currentColor";
      }
    }

    const Component = IconLibrary.getComponent(icon);

    return (
      <Component color={color} size={size} className={className}>
        {initial?.charAt(0).toUpperCase()}
      </Component>
    );
  }
);

type IconTitleWrapperProps = {
  dir?: string;
  /**
   * galadrim: when set, the icon is a square of this many px placed above the
   * title and aligned with its start at every breakpoint, like the icon of a
   * Notion page. When unset the upstream placement applies (40px, in the gutter
   * beside the title from the tablet breakpoint up).
   */
  $above?: number;
  /** galadrim: gap in px between an `$above` icon and the title, default 40. */
  $gap?: number;
};

export const IconTitleWrapper = styled(Flex)<IconTitleWrapperProps>`
  align-items: center;
  justify-content: center;
  position: absolute;
  top: -44px;
  height: 40px;
  width: 40px;

  // Always move above TOC
  z-index: 1;

  ${breakpoint("tablet")`
    top: 3px;
    ${(props: IconTitleWrapperProps) =>
      props.dir === "rtl" ? "right: -44px" : "left: -44px"};
  `}

  // galadrim: the doubled class is required. The CSS preprocessor moves the
  // media query above after every plain declaration of this rule, so that at
  // equal specificity its "top" and "left" would win from the tablet
  // breakpoint up whatever the order here.
  ${(props) =>
    props.$above
      ? css`
          && {
            top: auto;
            bottom: calc(100% + ${props.$gap ?? 40}px);
            height: ${props.$above}px;
            width: ${props.$above}px;
            ${
              props.dir === "rtl"
                ? "right: 0; left: auto;"
                : "left: 0; right: auto;"
            }
          }
        `
      : ""}
`;

const Span = styled(Flex)<{ size: number }>`
  width: ${(props) => props.size}px;
  height: ${(props) => props.size}px;
  align-items: center;
  justify-content: center;
`;

export default Icon;

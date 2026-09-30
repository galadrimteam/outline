import { isUUID } from "validator";
import styled from "styled-components";
import { s } from "../styles";

type Props = {
  /** The emoji to render */
  emoji: string;
  /** The size of the emoji, 24px is default to match standard icons */
  size?: number;
  /**
   * galadrim: draws the emoji across the whole box, like the icon of a Notion
   * page, instead of at the size that lines it up with standard icons.
   */
  fullSize?: boolean;
  className?: string;
};

/**
 * EmojiIcon is a component that renders an emoji in the size of a standard icon
 * in a way that can be used wherever an Icon would be.
 */
export default function EmojiIcon({
  size = 24,
  emoji,
  fullSize,
  ...rest
}: Props) {
  return (
    <Span $size={size} {...rest}>
      <SVG
        size={size}
        scale={fullSize ? 1 : 0.7}
        emoji={isUUID(emoji) ? "�" : emoji}
      />
    </Span>
  );
}

const Span = styled.span<{ $size: number }>`
  font-family: ${s("fontFamilyEmoji")};
  display: inline-block;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
`;

const SVG = ({
  size,
  scale,
  emoji,
}: {
  size: number;
  scale: number;
  emoji: string;
}) => (
  <svg
    width={size}
    height={size}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    overflow="visible"
  >
    <text
      x="50%"
      y="55%"
      dominantBaseline="middle"
      textAnchor="middle"
      fontSize={size * scale}
    >
      {emoji}
    </text>
  </svg>
);

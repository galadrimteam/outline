import styled, { useTheme } from "styled-components";
import type { DatabaseField } from "@shared/databases/types";
import { s } from "@shared/styles";
import { toneColors } from "../../colors";

/** Notion's « Show as » of a number: a ring or a bar filled up to the value. */
export interface NumberShowAs {
  type: "ring" | "bar";
  /** The colour of the filled part, a Notion or engine colour name. */
  color?: string;
  /** The value that fills it whole (Notion's « Divide by »), 100 when unset. */
  maxValue?: number;
  /** Whether the number is written next to it. */
  showValue: boolean;
}

/**
 * How a number field asks its values to be drawn, when it asks for a ring or
 * a bar.
 *
 * @param field the field.
 * @returns the ring or bar settings, undefined for plain numbers.
 */
export function numberShowAs(field: DatabaseField): NumberShowAs | undefined {
  const showAs = field.options.showAs;
  if (showAs?.type !== "ring" && showAs?.type !== "bar") {
    return undefined;
  }
  return {
    type: showAs.type,
    color: typeof showAs.color === "string" ? showAs.color : undefined,
    maxValue:
      typeof showAs.maxValue === "number" && showAs.maxValue > 0
        ? showAs.maxValue
        : undefined,
    showValue: showAs.showValue !== false,
  };
}

/**
 * How full a ring or a bar is: the number as the field shows it (a
 * percentage for percent fields) over the value that fills it.
 *
 * @param value the number.
 * @param showAs the ring or bar settings.
 * @param percent whether the field shows its numbers as percentages.
 * @returns a share between 0 and 1.
 */
export function gaugeShare(
  value: number,
  showAs: Pick<NumberShowAs, "maxValue">,
  percent: boolean
): number {
  const shown = percent ? value * 100 : value;
  const share = shown / (showAs.maxValue ?? 100);
  return Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
}

interface Props {
  showAs: NumberShowAs;
  /** How full it is, between 0 and 1. */
  share: number;
}

/**
 * A ring or a bar filled up to a share, like Notion's number « Show as ».
 *
 * @param props the settings and the share.
 * @returns the gauge.
 */
export function NumberGauge({ showAs, share }: Props) {
  const theme = useTheme();
  const color = toneColors(showAs.color ?? "blue", theme).dot;

  if (showAs.type === "bar") {
    return (
      <Bar aria-hidden>
        <BarFill style={{ width: `${share * 100}%`, background: color }} />
      </Bar>
    );
  }

  const radius = 6;
  const length = 2 * Math.PI * radius;
  return (
    <Ring aria-hidden width={16} height={16} viewBox="0 0 16 16">
      <circle cx={8} cy={8} r={radius} fill="none" strokeWidth={2.5} />
      <circle
        cx={8}
        cy={8}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={`${share * length} ${length}`}
        transform="rotate(-90 8 8)"
      />
    </Ring>
  );
}

const Ring = styled.svg`
  flex-shrink: 0;

  circle:first-child {
    stroke: ${s("divider")};
  }
`;

const Bar = styled.span`
  position: relative;
  display: inline-block;
  flex: 1 1 40px;
  min-width: 24px;
  max-width: 120px;
  height: 4px;
  border-radius: 2px;
  background: ${s("divider")};
  overflow: hidden;
`;

const BarFill = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 2px;
`;

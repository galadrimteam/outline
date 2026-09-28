import type { DefaultTheme } from "styled-components";

/** Notion's option tones; engine colour names are folded onto them. */
export type DatabaseTone =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink"
  | "red";

/** The colours used to draw one option: a chip, a dot and a board column. */
export interface DatabaseToneColors {
  /** Chip background. */
  background: string;
  /** Chip text. */
  text: string;
  /** Small dot before a status or a column name. */
  dot: string;
  /** Tint of a board column holding the option. */
  column: string;
}

/**
 * Folds an engine colour name (Teable's `blueLight2`, `orange`, …) onto a
 * Notion tone. The migration writes Notion's default as `grayLight2`, gray as
 * `grayLight1` and brown, which the engine lacks, as `orangeLight1`.
 *
 * @param color the engine colour name.
 * @returns the tone.
 */
export function toneOf(color: string | null | undefined): DatabaseTone {
  if (!color) {
    return "default";
  }
  if (color === "grayLight2") {
    return "default";
  }
  if (color === "orangeLight1") {
    return "brown";
  }

  const family = color.replace(/(Light\d|Bright|Dark\d)$/, "");
  switch (family) {
    case "gray":
      return "gray";
    case "orange":
      return "orange";
    case "yellow":
      return "yellow";
    case "green":
      return "green";
    case "teal":
    case "cyan":
      return "teal";
    case "blue":
      return "blue";
    case "purple":
      return "purple";
    case "pink":
      return "pink";
    case "red":
      return "red";
    default:
      return "default";
  }
}

/**
 * The colours of an option in the current theme, Notion's pastel palette in
 * light mode and its muted one in dark mode.
 *
 * @param color the engine colour name of the option.
 * @param theme the current theme.
 * @returns chip, dot and column colours.
 */
export function toneColors(
  color: string | null | undefined,
  theme: Pick<DefaultTheme, "isDark">
): DatabaseToneColors {
  const tone = toneOf(color);
  return theme.isDark ? darkTones[tone] : lightTones[tone];
}

const lightTones: Record<DatabaseTone, DatabaseToneColors> = {
  default: {
    background: "rgba(227, 226, 224, 0.5)",
    text: "rgb(50, 48, 44)",
    dot: "rgb(145, 145, 142)",
    column: "rgba(247, 247, 245, 0.7)",
  },
  gray: {
    background: "rgb(227, 226, 224)",
    text: "rgb(50, 48, 44)",
    dot: "rgb(145, 145, 142)",
    column: "rgba(248, 248, 247, 0.7)",
  },
  brown: {
    background: "rgb(238, 224, 218)",
    text: "rgb(68, 42, 30)",
    dot: "rgb(159, 107, 83)",
    column: "rgba(250, 246, 245, 0.7)",
  },
  orange: {
    background: "rgb(250, 222, 201)",
    text: "rgb(73, 41, 14)",
    dot: "rgb(217, 115, 13)",
    column: "rgba(252, 245, 242, 0.7)",
  },
  yellow: {
    background: "rgb(253, 236, 200)",
    text: "rgb(64, 44, 27)",
    dot: "rgb(203, 145, 47)",
    column: "rgba(250, 247, 237, 0.7)",
  },
  green: {
    background: "rgb(219, 237, 219)",
    text: "rgb(28, 56, 41)",
    dot: "rgb(68, 131, 97)",
    column: "rgba(244, 248, 243, 0.7)",
  },
  teal: {
    background: "rgb(214, 236, 235)",
    text: "rgb(22, 60, 58)",
    dot: "rgb(45, 152, 145)",
    column: "rgba(242, 248, 248, 0.7)",
  },
  blue: {
    background: "rgb(211, 229, 239)",
    text: "rgb(24, 51, 71)",
    dot: "rgb(51, 126, 169)",
    column: "rgba(243, 247, 250, 0.7)",
  },
  purple: {
    background: "rgb(232, 222, 238)",
    text: "rgb(65, 36, 84)",
    dot: "rgb(144, 101, 176)",
    column: "rgba(248, 245, 250, 0.7)",
  },
  pink: {
    background: "rgb(245, 224, 233)",
    text: "rgb(76, 35, 55)",
    dot: "rgb(193, 76, 138)",
    column: "rgba(251, 245, 248, 0.7)",
  },
  red: {
    background: "rgb(255, 226, 221)",
    text: "rgb(93, 23, 21)",
    dot: "rgb(212, 76, 71)",
    column: "rgba(253, 245, 243, 0.7)",
  },
};

const darkTones: Record<DatabaseTone, DatabaseToneColors> = {
  default: {
    background: "rgba(255, 255, 255, 0.094)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(127, 127, 127)",
    column: "rgba(255, 255, 255, 0.03)",
  },
  gray: {
    background: "rgb(90, 90, 90)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(155, 155, 155)",
    column: "rgba(255, 255, 255, 0.04)",
  },
  brown: {
    background: "rgb(96, 59, 44)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(186, 133, 111)",
    column: "rgba(96, 59, 44, 0.18)",
  },
  orange: {
    background: "rgb(133, 76, 29)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(199, 125, 72)",
    column: "rgba(133, 76, 29, 0.18)",
  },
  yellow: {
    background: "rgb(137, 99, 42)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(202, 152, 73)",
    column: "rgba(137, 99, 42, 0.18)",
  },
  green: {
    background: "rgb(43, 89, 63)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(82, 158, 114)",
    column: "rgba(43, 89, 63, 0.2)",
  },
  teal: {
    background: "rgb(33, 83, 80)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(64, 160, 152)",
    column: "rgba(33, 83, 80, 0.2)",
  },
  blue: {
    background: "rgb(40, 69, 108)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(55, 154, 211)",
    column: "rgba(40, 69, 108, 0.2)",
  },
  purple: {
    background: "rgb(73, 47, 100)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(157, 104, 211)",
    column: "rgba(73, 47, 100, 0.2)",
  },
  pink: {
    background: "rgb(105, 49, 76)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(209, 87, 150)",
    column: "rgba(105, 49, 76, 0.2)",
  },
  red: {
    background: "rgb(110, 54, 48)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(230, 91, 80)",
    column: "rgba(110, 54, 48, 0.2)",
  },
};

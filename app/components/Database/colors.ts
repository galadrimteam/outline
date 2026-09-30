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

/** The colours used to draw one option: a chip, a dot, a board column and a card. */
export interface DatabaseToneColors {
  /** Chip background. */
  background: string;
  /** Chip text. */
  text: string;
  /** Dot before a status or a column name, count and « New page » of that column. */
  dot: string;
  /** Tint of a board column holding the option. */
  column: string;
  /** Outline of the « New page » button of that column. */
  border: string;
  /** Background of a card coloured by the option. */
  card: string;
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
    dot: "rgb(142, 139, 134)",
    column: "rgb(249, 248, 247)",
    border: "rgb(234, 232, 230)",
    card: "rgb(255, 255, 255)",
  },
  gray: {
    background: "rgb(227, 226, 224)",
    text: "rgb(50, 48, 44)",
    dot: "rgb(142, 139, 134)",
    column: "rgb(249, 248, 247)",
    border: "rgb(234, 232, 230)",
    card: "rgb(241, 241, 239)",
  },
  brown: {
    background: "rgb(238, 224, 218)",
    text: "rgb(68, 42, 30)",
    dot: "rgb(176, 122, 91)",
    column: "rgb(251, 248, 246)",
    border: "rgb(240, 228, 221)",
    card: "rgb(244, 238, 238)",
  },
  orange: {
    background: "rgb(250, 222, 201)",
    text: "rgb(73, 41, 14)",
    dot: "rgb(213, 128, 59)",
    column: "rgb(252, 247, 244)",
    border: "rgb(249, 228, 214)",
    card: "rgb(251, 235, 222)",
  },
  yellow: {
    background: "rgb(253, 236, 200)",
    text: "rgb(64, 44, 27)",
    dot: "rgb(216, 163, 47)",
    column: "rgb(252, 250, 239)",
    border: "rgb(246, 236, 205)",
    card: "rgb(251, 243, 219)",
  },
  green: {
    background: "rgb(219, 237, 219)",
    text: "rgb(28, 56, 41)",
    dot: "rgb(80, 152, 110)",
    column: "rgb(246, 250, 247)",
    border: "rgb(221, 237, 225)",
    card: "rgb(237, 243, 236)",
  },
  teal: {
    background: "rgb(214, 236, 235)",
    text: "rgb(22, 60, 58)",
    dot: "rgb(52, 157, 150)",
    column: "rgb(244, 250, 250)",
    border: "rgb(214, 237, 235)",
    card: "rgb(231, 243, 243)",
  },
  blue: {
    background: "rgb(211, 229, 239)",
    text: "rgb(24, 51, 71)",
    dot: "rgb(39, 131, 222)",
    column: "rgb(243, 249, 253)",
    border: "rgb(221, 238, 250)",
    card: "rgb(231, 243, 248)",
  },
  purple: {
    background: "rgb(232, 222, 238)",
    text: "rgb(65, 36, 84)",
    dot: "rgb(157, 104, 211)",
    column: "rgb(250, 247, 252)",
    border: "rgb(236, 225, 245)",
    card: "rgb(244, 240, 247)",
  },
  pink: {
    background: "rgb(245, 224, 233)",
    text: "rgb(76, 35, 55)",
    dot: "rgb(209, 87, 150)",
    column: "rgb(252, 246, 249)",
    border: "rgb(245, 222, 234)",
    card: "rgb(249, 238, 243)",
  },
  red: {
    background: "rgb(255, 226, 221)",
    text: "rgb(93, 23, 21)",
    dot: "rgb(229, 100, 88)",
    column: "rgb(253, 246, 246)",
    border: "rgb(250, 225, 223)",
    card: "rgb(252, 233, 231)",
  },
};

const darkTones: Record<DatabaseTone, DatabaseToneColors> = {
  default: {
    background: "rgba(255, 255, 255, 0.094)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(127, 127, 127)",
    column: "rgba(255, 255, 255, 0.03)",
    border: "rgba(255, 255, 255, 0.094)",
    card: "#252525",
  },
  gray: {
    background: "rgb(90, 90, 90)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(155, 155, 155)",
    column: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.094)",
    card: "rgb(47, 47, 47)",
  },
  brown: {
    background: "rgb(96, 59, 44)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(186, 133, 111)",
    column: "rgba(96, 59, 44, 0.18)",
    border: "rgba(186, 133, 111, 0.25)",
    card: "rgb(74, 50, 40)",
  },
  orange: {
    background: "rgb(133, 76, 29)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(199, 125, 72)",
    column: "rgba(133, 76, 29, 0.18)",
    border: "rgba(199, 125, 72, 0.25)",
    card: "rgb(92, 59, 35)",
  },
  yellow: {
    background: "rgb(137, 99, 42)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(202, 152, 73)",
    column: "rgba(137, 99, 42, 0.18)",
    border: "rgba(202, 152, 73, 0.25)",
    card: "rgb(86, 67, 40)",
  },
  green: {
    background: "rgb(43, 89, 63)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(82, 158, 114)",
    column: "rgba(43, 89, 63, 0.2)",
    border: "rgba(82, 158, 114, 0.25)",
    card: "rgb(36, 61, 48)",
  },
  teal: {
    background: "rgb(33, 83, 80)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(64, 160, 152)",
    column: "rgba(33, 83, 80, 0.2)",
    border: "rgba(64, 160, 152, 0.25)",
    card: "rgb(33, 60, 58)",
  },
  blue: {
    background: "rgb(40, 69, 108)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(55, 154, 211)",
    column: "rgba(40, 69, 108, 0.2)",
    border: "rgba(55, 154, 211, 0.25)",
    card: "rgb(20, 58, 78)",
  },
  purple: {
    background: "rgb(73, 47, 100)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(157, 104, 211)",
    column: "rgba(73, 47, 100, 0.2)",
    border: "rgba(157, 104, 211, 0.25)",
    card: "rgb(60, 45, 73)",
  },
  pink: {
    background: "rgb(105, 49, 76)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(209, 87, 150)",
    column: "rgba(105, 49, 76, 0.2)",
    border: "rgba(209, 87, 150, 0.25)",
    card: "rgb(78, 44, 60)",
  },
  red: {
    background: "rgb(110, 54, 48)",
    text: "rgba(255, 255, 255, 0.81)",
    dot: "rgb(230, 91, 80)",
    column: "rgba(110, 54, 48, 0.2)",
    border: "rgba(230, 91, 80, 0.25)",
    card: "rgb(82, 46, 42)",
  },
};

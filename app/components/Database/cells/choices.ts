import type {
  DatabaseField,
  DatabaseSelectChoice,
} from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";

/**
 * The colours offered for options, in Notion's order: default, gray, brown, orange, yellow, green,
 * blue, purple, pink, red (engine colour names, as the migration writes them).
 */
export const CHOICE_COLORS = [
  "grayLight2",
  "grayLight1",
  "orangeLight1",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

/** Status groups in the order Notion shows them. */
export const STATUS_GROUP_ORDER: DatabaseStatusGroup[] = [
  DatabaseStatusGroup.ToDo,
  DatabaseStatusGroup.InProgress,
  DatabaseStatusGroup.Complete,
];

/** Options of one status group; `group` is null for options in no group. */
export interface ChoiceSection {
  group: DatabaseStatusGroup | null;
  choices: DatabaseSelectChoice[];
}

/**
 * Whether a field is a Notion-like status: a single select whose options are sorted in groups.
 *
 * @param field the field.
 * @returns true for status fields.
 */
export function isStatusField(field: DatabaseField): boolean {
  return (
    field.type === DatabaseFieldType.SingleSelect &&
    Object.keys(field.meta?.statusGroups ?? {}).length > 0
  );
}

/**
 * The options whose name contains the query, ignoring case and accents.
 *
 * @param choices the options.
 * @param query what the reader typed.
 * @returns the matching options, in order.
 */
export function filterChoices(
  choices: DatabaseSelectChoice[],
  query: string
): DatabaseSelectChoice[] {
  const needle = normalize(query);
  if (!needle) {
    return choices;
  }
  return choices.filter((choice) => normalize(choice.name).includes(needle));
}

/**
 * Whether an option with this exact name (ignoring case and surrounding spaces) exists.
 *
 * @param choices the options.
 * @param name the name.
 * @returns true when it exists.
 */
export function hasChoice(
  choices: DatabaseSelectChoice[],
  name: string
): boolean {
  const wanted = name.trim().toLocaleLowerCase();
  return choices.some(
    (choice) => choice.name.trim().toLocaleLowerCase() === wanted
  );
}

/**
 * The colour of the next new option, cycling through the palette.
 *
 * @param choices the existing options.
 * @returns an engine colour name.
 */
export function nextChoiceColor(choices: DatabaseSelectChoice[]): string {
  return CHOICE_COLORS[(choices.length + 1) % CHOICE_COLORS.length];
}

/**
 * Adds an option at the end.
 *
 * @param choices the options.
 * @param name the new option's name.
 * @returns the new options.
 */
export function appendChoice(
  choices: DatabaseSelectChoice[],
  name: string
): DatabaseSelectChoice[] {
  return [...choices, { name: name.trim(), color: nextChoiceColor(choices) }];
}

/**
 * Changes one option, keeping its id so that the engine renames the values in the rows.
 *
 * @param choices the options.
 * @param name the option to change.
 * @param patch its new name and/or colour.
 * @returns the new options.
 */
export function updateChoice(
  choices: DatabaseSelectChoice[],
  name: string,
  patch: Partial<Pick<DatabaseSelectChoice, "name" | "color">>
): DatabaseSelectChoice[] {
  return choices.map((choice) =>
    choice.name === name
      ? {
          ...choice,
          ...patch,
          name: patch.name?.trim() || choice.name,
        }
      : choice
  );
}

/**
 * Removes an option.
 *
 * @param choices the options.
 * @param name the option to remove.
 * @returns the new options.
 */
export function removeChoice(
  choices: DatabaseSelectChoice[],
  name: string
): DatabaseSelectChoice[] {
  return choices.filter((choice) => choice.name !== name);
}

/**
 * Moves an option to the place of another one.
 *
 * @param choices the options.
 * @param from the name of the option moved.
 * @param to the name of the option whose place it takes.
 * @returns the new options.
 */
export function moveChoice(
  choices: DatabaseSelectChoice[],
  from: string,
  to: string
): DatabaseSelectChoice[] {
  const fromIndex = choices.findIndex((choice) => choice.name === from);
  const toIndex = choices.findIndex((choice) => choice.name === to);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return choices;
  }
  const next = [...choices];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Sorts the options of a status field into its groups, in Notion's group order; options in no
 * group come last.
 *
 * @param choices the options.
 * @param statusGroups option name → group.
 * @returns the non-empty sections.
 */
export function groupChoices(
  choices: DatabaseSelectChoice[],
  statusGroups: Record<string, DatabaseStatusGroup> | undefined
): ChoiceSection[] {
  const sections: ChoiceSection[] = STATUS_GROUP_ORDER.map((group) => ({
    group,
    choices: choices.filter((choice) => statusGroups?.[choice.name] === group),
  }));
  sections.push({
    group: null,
    choices: choices.filter(
      (choice) =>
        !statusGroups?.[choice.name] ||
        !STATUS_GROUP_ORDER.includes(statusGroups[choice.name])
    ),
  });
  return sections.filter((section) => section.choices.length > 0);
}

/**
 * Status groups after an option was renamed, added (`from` null) or removed (`to` null).
 *
 * @param statusGroups option name → group.
 * @param from the old name, null for a new option.
 * @param to the new name, null when the option is removed.
 * @param group the group of a new option.
 * @returns the new status groups.
 */
export function renameStatusChoice(
  statusGroups: Record<string, DatabaseStatusGroup>,
  from: string | null,
  to: string | null,
  group: DatabaseStatusGroup = DatabaseStatusGroup.ToDo
): Record<string, DatabaseStatusGroup> {
  const next = { ...statusGroups };
  const current = from !== null ? next[from] : group;
  if (from !== null) {
    delete next[from];
  }
  if (to !== null && current) {
    next[to] = current;
  }
  return next;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase();
}

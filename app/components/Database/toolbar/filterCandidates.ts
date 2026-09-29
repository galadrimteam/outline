import { FILTER_ME } from "@shared/databases/filters";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseLinkValue,
  DatabaseRecord,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { isLinkItem, isUserItem, toArray } from "../cells/format";

/** A value offered by the filter's value picker. */
export interface PickerOption {
  /** What the filter stores: a choice name, an engine user id, a row id or "Me". */
  value: string;
  /** Text searched and shown when no cell renders it. */
  label: string;
  /** A cell value drawn with the field's renderer. */
  cell?: DatabaseCellValue;
}

/** A member of the team, as the users store knows them. */
export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** How the values of a field are picked in a filter rule. */
export type CandidateKind = "choice" | "person" | "link";

/**
 * Returns how the values of a field are picked in a filter rule.
 *
 * @param field the field of the rule.
 * @returns the kind, or undefined when the value is typed.
 */
export function candidateKind(field: DatabaseField): CandidateKind | undefined {
  switch (field.type) {
    case DatabaseFieldType.SingleSelect:
    case DatabaseFieldType.MultipleSelect:
      return "choice";
    case DatabaseFieldType.User:
    case DatabaseFieldType.CreatedBy:
    case DatabaseFieldType.LastModifiedBy:
      return "person";
    case DatabaseFieldType.Link:
      return "link";
    default:
      return undefined;
  }
}

/**
 * Returns the options of a single or multiple select, in their order.
 *
 * @param field the select field.
 * @returns the options.
 */
export function choiceOptions(field: DatabaseField): PickerOption[] {
  return (field.options.choices ?? []).map((choice) => ({
    value: choice.name,
    label: choice.name,
    cell: choice.name,
  }));
}

/**
 * Returns the values a field holds in loaded rows and in the group headers
 * the engine computed over every row.
 *
 * @param field the field.
 * @param records the loaded rows.
 * @param points the group points of the view grouped by the field.
 * @returns the cell values, possibly repeated.
 */
export function fieldValues(
  field: DatabaseField,
  records: DatabaseRecord[],
  points: DatabaseGroupPoint[]
): DatabaseCellValue[] {
  return [
    ...records.map((record) => record.fields[field.id]),
    ...points.flatMap((point) =>
      point.type === "header" ? [point.value] : []
    ),
  ];
}

/**
 * Returns the people a person filter offers: « Me », the people found in the
 * rows, then the members of the team found in none, sorted by name.
 *
 * @param values the values of the field in the rows.
 * @param members the members of the team matching the search.
 * @param meLabel the label of « Me ».
 * @returns the options.
 */
export function peopleOptions(
  values: DatabaseCellValue[],
  members: TeamMember[],
  meLabel: string
): PickerOption[] {
  const people = new Map<string, PickerOption>();
  const memberIdsInRows = new Set<string>();
  for (const person of values.flatMap((value) => toArray(value))) {
    if (!isUserItem(person) || people.has(person.id)) {
      continue;
    }
    people.set(person.id, {
      value: person.id,
      label: person.title,
      cell: person,
    });
    if (person.outlineUserId) {
      memberIdsInRows.add(person.outlineUserId);
    }
  }
  // A member found in no row matches no row whatever the id the filter holds,
  // so their Outline id may stand for the engine's user id.
  for (const member of members) {
    if (memberIdsInRows.has(member.id) || people.has(member.id)) {
      continue;
    }
    people.set(member.id, {
      value: member.id,
      label: member.name,
      cell: {
        id: member.id,
        title: member.name,
        avatarUrl: member.avatarUrl,
        outlineUserId: member.id,
      },
    });
  }
  return [{ value: FILTER_ME, label: meLabel }, ...byLabel(people.values())];
}

/**
 * Returns the linked rows a relation filter offers: those found in the rows
 * and the candidates of the linked table, sorted by title.
 *
 * @param values the values of the field in the rows.
 * @param candidates the rows of the linked table matching the search.
 * @returns the options.
 */
export function linkOptions(
  values: DatabaseCellValue[],
  candidates: DatabaseLinkValue[]
): PickerOption[] {
  const links = new Map<string, PickerOption>();
  for (const link of [
    ...values.flatMap((value) => toArray(value)),
    ...candidates,
  ]) {
    if (isLinkItem(link) && !links.has(link.id)) {
      links.set(link.id, {
        value: link.id,
        label: link.title || link.id,
        cell: [link],
      });
    }
  }
  return byLabel(links.values());
}

function byLabel(options: Iterable<PickerOption>): PickerOption[] {
  return Array.from(options).sort((a, b) => a.label.localeCompare(b.label));
}

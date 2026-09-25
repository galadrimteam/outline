import type { TFunction } from "i18next";
import type {
  DatabaseField,
  DatabaseFieldMeta,
  DatabaseFieldOptions,
} from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";

/**
 * The property types offered when adding or converting a property, as Notion lists them. Several
 * are one engine type with options (URL, e-mail and phone are texts shown as links; status is a
 * single select with status groups).
 */
export type FieldKindId =
  | "text"
  | "number"
  | "select"
  | "multiSelect"
  | "status"
  | "date"
  | "person"
  | "files"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "longText"
  | "rating"
  | "createdTime"
  | "createdBy"
  | "lastEditedTime"
  | "lastEditedBy"
  | "autoNumber";

/** A property type offered in menus. */
export interface FieldKind {
  id: FieldKindId;
  type: DatabaseFieldType;
}

/** The property types, in Notion's menu order. */
export const FIELD_KINDS: FieldKind[] = [
  { id: "text", type: DatabaseFieldType.SingleLineText },
  { id: "number", type: DatabaseFieldType.Number },
  { id: "select", type: DatabaseFieldType.SingleSelect },
  { id: "multiSelect", type: DatabaseFieldType.MultipleSelect },
  { id: "status", type: DatabaseFieldType.SingleSelect },
  { id: "date", type: DatabaseFieldType.Date },
  { id: "person", type: DatabaseFieldType.User },
  { id: "files", type: DatabaseFieldType.Attachment },
  { id: "checkbox", type: DatabaseFieldType.Checkbox },
  { id: "url", type: DatabaseFieldType.SingleLineText },
  { id: "email", type: DatabaseFieldType.SingleLineText },
  { id: "phone", type: DatabaseFieldType.SingleLineText },
  { id: "longText", type: DatabaseFieldType.LongText },
  { id: "rating", type: DatabaseFieldType.Rating },
  { id: "createdTime", type: DatabaseFieldType.CreatedTime },
  { id: "createdBy", type: DatabaseFieldType.CreatedBy },
  { id: "lastEditedTime", type: DatabaseFieldType.LastModifiedTime },
  { id: "lastEditedBy", type: DatabaseFieldType.LastModifiedBy },
  { id: "autoNumber", type: DatabaseFieldType.AutoNumber },
];

/** What creating or converting a property of a kind sends. */
export interface FieldKindSetup {
  type: DatabaseFieldType;
  options: DatabaseFieldOptions;
  /** Outline meta to save next to the field (status groups). */
  meta?: DatabaseFieldMeta;
}

/**
 * The kind of an existing property.
 *
 * @param field the property.
 * @returns its kind, undefined for types that cannot be picked (relation, formula…).
 */
export function fieldKindOf(field: DatabaseField): FieldKindId | undefined {
  switch (field.type) {
    case DatabaseFieldType.SingleLineText: {
      const showAs = field.options.showAs?.type;
      if (showAs === "url" || showAs === "email" || showAs === "phone") {
        return showAs;
      }
      return "text";
    }
    case DatabaseFieldType.SingleSelect:
      return Object.keys(field.meta?.statusGroups ?? {}).length
        ? "status"
        : "select";
    default:
      return FIELD_KINDS.find((kind) => kind.type === field.type)?.id;
  }
}

/**
 * The name of a property kind.
 *
 * @param id the kind.
 * @param t the translation function.
 * @returns the label.
 */
export function fieldKindLabel(id: FieldKindId, t: TFunction): string {
  switch (id) {
    case "text":
      return t("Text");
    case "number":
      return t("Number");
    case "select":
      return t("Select");
    case "multiSelect":
      return t("Multi-select");
    case "status":
      return t("Status");
    case "date":
      return t("Date");
    case "person":
      return t("Person");
    case "files":
      return t("Files & media");
    case "checkbox":
      return t("Checkbox");
    case "url":
      return t("URL");
    case "email":
      return t("Email");
    case "phone":
      return t("Phone");
    case "longText":
      return t("Long text");
    case "rating":
      return t("Rating");
    case "createdTime":
      return t("Created time");
    case "createdBy":
      return t("Created by");
    case "lastEditedTime":
      return t("Last edited time");
    case "lastEditedBy":
      return t("Last edited by");
    case "autoNumber":
      return t("ID");
  }
}

/**
 * The type, options and meta to create a property of a kind, or to convert one to it. Options of
 * the current field worth keeping (select options between select kinds) are carried over.
 *
 * @param id the kind.
 * @param t the translation function, for default status options.
 * @param current the property being converted.
 * @returns the setup to send.
 */
export function fieldKindSetup(
  id: FieldKindId,
  t: TFunction,
  current?: DatabaseField
): FieldKindSetup {
  const timeZone = browserTimeZone();
  const choices = current?.options.choices;

  switch (id) {
    case "text":
      return { type: DatabaseFieldType.SingleLineText, options: {} };
    case "url":
    case "email":
    case "phone":
      return {
        type: DatabaseFieldType.SingleLineText,
        options: { showAs: { type: id } },
      };
    case "longText":
      return { type: DatabaseFieldType.LongText, options: {} };
    case "number":
      return {
        type: DatabaseFieldType.Number,
        options: { formatting: { type: "decimal", precision: 0 } },
      };
    case "select":
      return {
        type: DatabaseFieldType.SingleSelect,
        options: { choices: choices ?? [] },
        meta: current?.meta?.statusGroups ? { statusGroups: {} } : undefined,
      };
    case "multiSelect":
      return {
        type: DatabaseFieldType.MultipleSelect,
        options: { choices: choices ?? [] },
      };
    case "status": {
      const statusChoices = choices?.length
        ? choices
        : [
            { name: t("Not started"), color: "grayLight2" },
            { name: t("In progress"), color: "blue" },
            { name: t("Done"), color: "green" },
          ];
      const groups = [
        DatabaseStatusGroup.ToDo,
        DatabaseStatusGroup.InProgress,
        DatabaseStatusGroup.Complete,
      ];
      const statusGroups: Record<string, DatabaseStatusGroup> = {};
      statusChoices.forEach((choice, index) => {
        statusGroups[choice.name] =
          current?.meta?.statusGroups?.[choice.name] ??
          groups[Math.min(index, groups.length - 1)];
      });
      return {
        type: DatabaseFieldType.SingleSelect,
        options: { choices: statusChoices },
        meta: { statusGroups },
      };
    }
    case "date":
      return {
        type: DatabaseFieldType.Date,
        options: {
          formatting: { date: "D MMMM YYYY", time: "None", timeZone },
        },
      };
    case "person":
      return {
        type: DatabaseFieldType.User,
        options: { isMultiple: true, shouldNotify: true },
      };
    case "files":
      return { type: DatabaseFieldType.Attachment, options: {} };
    case "checkbox":
      return { type: DatabaseFieldType.Checkbox, options: {} };
    case "rating":
      return {
        type: DatabaseFieldType.Rating,
        options: { icon: "star", color: "yellowBright", max: 5 },
      };
    case "createdTime":
    case "lastEditedTime":
      return {
        type:
          id === "createdTime"
            ? DatabaseFieldType.CreatedTime
            : DatabaseFieldType.LastModifiedTime,
        options: {
          formatting: { date: "D MMMM YYYY", time: "HH:mm", timeZone },
        },
      };
    case "createdBy":
      return { type: DatabaseFieldType.CreatedBy, options: {} };
    case "lastEditedBy":
      return { type: DatabaseFieldType.LastModifiedBy, options: {} };
    case "autoNumber":
      return { type: DatabaseFieldType.AutoNumber, options: {} };
  }
}

/**
 * Whether converting a property to a kind may lose data, so that the reader confirms first.
 * Anything to plain text keeps the values' text; text to options makes options of the values;
 * a single select widens to a multi select.
 *
 * @param field the property.
 * @param to the kind it becomes.
 * @returns true when values may be lost.
 */
export function isLossyConversion(
  field: DatabaseField,
  to: FieldKindId
): boolean {
  const from = fieldKindOf(field);
  if (from === to) {
    return false;
  }
  if (field.isComputed || field.isLookup || !from) {
    return true;
  }

  const textKinds: FieldKindId[] = [
    "text",
    "longText",
    "url",
    "email",
    "phone",
  ];
  const selectKinds: FieldKindId[] = ["select", "status"];
  const structured: FieldKindId[] = ["files", "person"];

  if (textKinds.includes(to)) {
    return structured.includes(from);
  }
  if (textKinds.includes(from)) {
    return !(selectKinds.includes(to) || to === "multiSelect");
  }
  if (selectKinds.includes(from)) {
    return !(selectKinds.includes(to) || to === "multiSelect");
  }
  if (from === "rating" && to === "number") {
    return false;
  }
  return true;
}

/**
 * A property name not used yet: the base, then the base followed by a number.
 *
 * @param fields the existing properties.
 * @param base the wanted name.
 * @returns a free name.
 */
export function uniqueFieldName(
  fields: Pick<DatabaseField, "name">[],
  base: string
): string {
  const taken = new Set(fields.map((field) => field.name.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) {
    return base;
  }
  for (let index = 1; ; index++) {
    const candidate = `${base} (${index})`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

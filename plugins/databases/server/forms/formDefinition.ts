import { sortBy } from "es-toolkit/compat";
import type {
  DatabaseFormDefinition,
  DatabaseFormQuestion,
} from "@shared/databases/forms";
import type {
  DatabaseField,
  DatabaseFieldOptions,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { Database } from "@server/models";
import env from "../env";
import type { FormSettings } from "./formSharing";

/** What a form shows to the person filling it. */
export interface FormAudience {
  /** Whether the person may submit it (signed in when the form asks so). */
  canSubmit: boolean;
  /** Whether person questions are asked: only members of the team can pick people. */
  allowPeople: boolean;
}

/** Field types a form asks; links and files need access to the database. */
const answerableTypes = new Set<DatabaseFieldType>([
  DatabaseFieldType.SingleLineText,
  DatabaseFieldType.LongText,
  DatabaseFieldType.Number,
  DatabaseFieldType.Rating,
  DatabaseFieldType.Checkbox,
  DatabaseFieldType.SingleSelect,
  DatabaseFieldType.MultipleSelect,
  DatabaseFieldType.Date,
  DatabaseFieldType.User,
]);

/** Options a form needs to draw a question; the others stay private. */
const publicOptionKeys: (keyof DatabaseFieldOptions)[] = [
  "choices",
  "defaultValue",
  "formatting",
  "showAs",
  "isMultiple",
  "timeZone",
  "max",
  "icon",
  "color",
];

/**
 * Returns the questions of a form view: its visible fields in the view's
 * order, with their « required » flag. A form without any visible field asks
 * for the row's title.
 *
 * @param fields the fields of the database.
 * @param view the form view.
 * @param allowPeople whether person questions are asked.
 * @returns the questions.
 */
export function formQuestions(
  fields: DatabaseField[],
  view: DatabaseView,
  allowPeople: boolean
): DatabaseFormQuestion[] {
  const answerable = fields.filter(
    (field) =>
      answerableTypes.has(field.type) &&
      !field.isComputed &&
      !field.isLookup &&
      (allowPeople || field.type !== DatabaseFieldType.User)
  );
  const visible = answerable.filter(
    (field) => view.columnMeta[field.id]?.visible
  );
  const asked = visible.length
    ? visible
    : answerable.filter((field) => field.isPrimary);

  return sortBy(asked, (field) => view.columnMeta[field.id]?.order ?? 0).map(
    (field) => ({
      field: publicField(field),
      required: !!view.columnMeta[field.id]?.required,
    })
  );
}

/**
 * Returns the definition of a form, what `databaseForms.info` sends.
 *
 * @param database the database.
 * @param view the form view.
 * @param fields the fields of the database.
 * @param settings the sharing of the form.
 * @param audience what the person filling it may do.
 * @returns the definition; without questions when the person may not submit.
 */
export function formDefinition(
  database: Database,
  view: DatabaseView,
  fields: DatabaseField[],
  settings: FormSettings,
  audience: FormAudience
): DatabaseFormDefinition {
  return {
    databaseId: database.id,
    viewId: view.id,
    title: view.name || database.title,
    description: view.description ?? null,
    coverUrl: absoluteUrl(view.options.coverUrl),
    logoUrl: absoluteUrl(view.options.logoUrl),
    submitLabel: view.options.submitLabel ?? null,
    successMessage: settings.successMessage ?? null,
    requireLogin: !!settings.requireLogin,
    canSubmit: audience.canSubmit,
    questions: audience.canSubmit
      ? formQuestions(fields, view, audience.allowPeople)
      : [],
  };
}

function publicField(field: DatabaseField): DatabaseField {
  const options: DatabaseFieldOptions = {};
  for (const key of publicOptionKeys) {
    if (field.options[key] !== undefined) {
      Object.assign(options, { [key]: field.options[key] });
    }
  }
  return {
    id: field.id,
    name: field.name,
    type: field.type,
    description: field.description ?? null,
    options,
    isPrimary: field.isPrimary,
    isComputed: false,
    isLookup: false,
    cellValueType: field.cellValueType,
    isMultipleCellValue: field.isMultipleCellValue,
    meta: field.meta,
  };
}

function absoluteUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  return url.startsWith("/") && env.TEABLE_PUBLIC_URL
    ? `${env.TEABLE_PUBLIC_URL}${url}`
    : url;
}

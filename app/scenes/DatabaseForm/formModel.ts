import type {
  DatabaseFormDefinition,
  DatabaseFormQuestion,
} from "@shared/databases/forms";
import type { DatabaseCellInput } from "@shared/databases/types";
import { FORM_HONEYPOT_FIELD } from "@shared/databases/forms";

/** The answers being typed, keyed by field id. */
export type FormAnswers = Record<string, DatabaseCellInput>;

/**
 * Tells whether an answer is empty.
 *
 * @param value the answer.
 * @returns true for nothing, blank text, an empty list or an unchecked box.
 */
export function isEmptyAnswer(value: DatabaseCellInput | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    value === false ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Returns the required questions left unanswered.
 *
 * @param questions the questions of the form.
 * @param answers the answers.
 * @returns the field ids of the missing answers.
 */
export function missingAnswers(
  questions: DatabaseFormQuestion[],
  answers: FormAnswers
): string[] {
  return questions
    .filter(
      (question) =>
        question.required && isEmptyAnswer(answers[question.field.id])
    )
    .map((question) => question.field.id);
}

/**
 * Returns the body of `databaseForms.submit`: the non-empty answers, the form
 * reference, and the honeypot as the page's hidden input left it.
 *
 * @param definition the form.
 * @param slug the public address, when the form is filled through it.
 * @param answers the answers.
 * @param honeypot the value of the hidden input.
 * @returns the request body.
 */
export function submission(
  definition: DatabaseFormDefinition,
  slug: string | undefined,
  answers: FormAnswers,
  honeypot: string
): Record<string, unknown> {
  const fields: FormAnswers = {};
  for (const question of definition.questions) {
    const value = answers[question.field.id];
    if (!isEmptyAnswer(value) && value !== undefined) {
      fields[question.field.id] = value;
    }
  }
  return {
    ...(slug
      ? { slug }
      : { databaseId: definition.databaseId, viewId: definition.viewId }),
    fields,
    ...(honeypot ? { [FORM_HONEYPOT_FIELD]: honeypot } : {}),
  };
}

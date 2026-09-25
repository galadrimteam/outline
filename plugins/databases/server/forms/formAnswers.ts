import type { DatabaseFormQuestion } from "@shared/databases/forms";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseUserInput,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { ValidationError } from "@server/errors";
import { isMultipleField } from "../automations/cellValues";

const maxShortText = 10000;
const maxLongText = 100000;

/**
 * Checks the answers of a form against its questions and returns the cells to
 * write: only the form's questions, a value each question type accepts, the
 * choices that exist (a form never adds one), every required question
 * answered.
 *
 * @param questions the questions of the form.
 * @param answers the submitted answers, keyed by field id.
 * @returns the cells, empty answers left out.
 * @throws ValidationError naming the question at fault.
 */
export function formAnswers(
  questions: DatabaseFormQuestion[],
  answers: Record<string, DatabaseCellInput>
): Record<string, DatabaseCellInput> {
  const byId = new Map(
    questions.map((question) => [question.field.id, question])
  );
  for (const fieldId of Object.keys(answers)) {
    if (!byId.has(fieldId)) {
      throw ValidationError("An answer does not belong to this form");
    }
  }

  const cells: Record<string, DatabaseCellInput> = {};
  for (const { field, required } of questions) {
    const value = answerOf(field, answers[field.id]);
    if (value === undefined) {
      if (required) {
        throw ValidationError(`« ${field.name} » is required`);
      }
      continue;
    }
    cells[field.id] = value;
  }
  return cells;
}

function answerOf(
  field: DatabaseField,
  answer: DatabaseCellInput | undefined
): DatabaseCellInput | undefined {
  if (
    answer === undefined ||
    answer === null ||
    answer === "" ||
    (Array.isArray(answer) && answer.length === 0)
  ) {
    return undefined;
  }
  const invalid = () => ValidationError(`« ${field.name} » is not valid`);

  switch (field.type) {
    case DatabaseFieldType.SingleLineText:
    case DatabaseFieldType.LongText: {
      if (typeof answer !== "string") {
        throw invalid();
      }
      const text = answer.trim();
      const max =
        field.type === DatabaseFieldType.LongText ? maxLongText : maxShortText;
      if (text.length > max) {
        throw invalid();
      }
      return text || undefined;
    }
    case DatabaseFieldType.Number: {
      const number =
        typeof answer === "number"
          ? answer
          : typeof answer === "string"
            ? Number(answer.replace(",", "."))
            : NaN;
      if (!Number.isFinite(number)) {
        throw invalid();
      }
      return number;
    }
    case DatabaseFieldType.Rating: {
      const max = field.options.max ?? 5;
      if (
        typeof answer !== "number" ||
        !Number.isInteger(answer) ||
        answer < 0 ||
        answer > max
      ) {
        throw invalid();
      }
      return answer || undefined;
    }
    case DatabaseFieldType.Checkbox:
      if (typeof answer !== "boolean") {
        throw invalid();
      }
      return answer || undefined;
    case DatabaseFieldType.SingleSelect:
      if (typeof answer !== "string" || !choiceNames(field).has(answer)) {
        throw invalid();
      }
      return answer;
    case DatabaseFieldType.MultipleSelect: {
      const names = choiceNames(field);
      if (
        !Array.isArray(answer) ||
        !answer.every(
          (item): item is string => typeof item === "string" && names.has(item)
        )
      ) {
        throw invalid();
      }
      return [...new Set(answer)];
    }
    case DatabaseFieldType.Date: {
      const date = typeof answer === "string" ? new Date(answer) : null;
      if (!date || Number.isNaN(date.getTime())) {
        throw invalid();
      }
      return date.toISOString();
    }
    case DatabaseFieldType.User: {
      const people = (Array.isArray(answer) ? answer : [answer]).filter(
        isUserInput
      );
      const count = Array.isArray(answer) ? answer.length : 1;
      if (people.length !== count || (!isMultipleField(field) && count > 1)) {
        throw invalid();
      }
      return isMultipleField(field) ? people : people[0];
    }
    default:
      throw invalid();
  }
}

function choiceNames(field: DatabaseField): Set<string> {
  return new Set((field.options.choices ?? []).map((choice) => choice.name));
}

function isUserInput(value: unknown): value is DatabaseUserInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "outlineUserId" in value &&
    typeof value.outlineUserId === "string" &&
    !("id" in value)
  );
}

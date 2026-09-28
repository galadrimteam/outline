import { observer } from "mobx-react";
import { DoneIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type {
  DatabaseFormDefinition,
  DatabaseFormQuestion,
} from "@shared/databases/forms";
import { FORM_HONEYPOT_FIELD } from "@shared/databases/forms";
import type { DatabaseCellInput } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import { CellValueField } from "~/components/Database/automations/CellValueField";
import useStores from "~/hooks/useStores";
import Database from "~/models/Database";
import { databaseRpc } from "~/stores/DatabasesStore";
import { ChoiceQuestion } from "./ChoiceQuestion";
import type { FormAnswers } from "./formModel";
import { missingAnswers, submission } from "./formModel";

interface Props {
  definition: DatabaseFormDefinition;
  /** The public address the form is filled through, if any. */
  slug?: string;
}

/**
 * A database form, Notion-like: a cover, a title, one question per visible
 * property of the form view, then a thank-you screen. Each answer is typed
 * with the cell editor of its property.
 *
 * @param props the form and its address.
 * @returns the form.
 */
export const FormPage = observer(function FormPage_({
  definition,
  slug,
}: Props) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const [answers, setAnswers] = React.useState<FormAnswers>({});
  const [honeypot, setHoneypot] = React.useState("");
  const [missing, setMissing] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSent, setIsSent] = React.useState(false);

  // A stand-alone model for the cell editors: it never enters the store, so
  // the partial schema of a form does not replace the database's.
  const database = React.useMemo(
    () =>
      new Database(
        {
          id: definition.databaseId,
          title: definition.title,
          icon: null,
          collectionId: "",
          documentId: null,
          url: "",
          settings: {},
          fields: definition.questions.map((question) => question.field),
          views: [],
        },
        databases
      ),
    [definition, databases]
  );

  const handleAnswer = React.useCallback(
    (fieldId: string, value: DatabaseCellInput) => {
      setAnswers((current) => ({ ...current, [fieldId]: value }));
      setMissing((current) => current.filter((id) => id !== fieldId));
    },
    []
  );

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const unanswered = missingAnswers(definition.questions, answers);
      if (unanswered.length) {
        setMissing(unanswered);
        return;
      }
      setIsSubmitting(true);
      try {
        await databaseRpc(
          "/databaseForms.submit",
          submission(definition, slug, answers, honeypot)
        );
        setIsSent(true);
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t("Couldn’t send the form, try again?")
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [answers, definition, honeypot, slug, t]
  );

  const handleAnother = React.useCallback(() => {
    setAnswers({});
    setIsSent(false);
  }, []);

  return (
    <Page>
      {definition.coverUrl && <Cover src={definition.coverUrl} alt="" />}
      <Sheet>
        {definition.logoUrl && <Logo src={definition.logoUrl} alt="" />}
        <Title>{definition.title}</Title>
        {isSent ? (
          <Sent role="status">
            <DoneIcon size={32} />
            <p>
              {definition.successMessage ||
                t("Thank you, your answer was sent.")}
            </p>
            <Button type="button" neutral onClick={handleAnother}>
              {t("Submit another answer")}
            </Button>
          </Sent>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {definition.description && (
              <Description>{definition.description}</Description>
            )}
            {definition.questions.map((question) => (
              <Question
                key={question.field.id}
                database={database}
                question={question}
                value={answers[question.field.id]}
                invalid={missing.includes(question.field.id)}
                onChange={handleAnswer}
              />
            ))}
            <Honeypot aria-hidden>
              <label>
                {FORM_HONEYPOT_FIELD}
                <input
                  type="text"
                  name={FORM_HONEYPOT_FIELD}
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </label>
            </Honeypot>
            {missing.length > 0 && (
              <Missing role="alert">
                {t("Answer the required questions to send the form.")}
              </Missing>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {definition.submitLabel || t("Submit")}
            </Button>
          </form>
        )}
      </Sheet>
    </Page>
  );
});

interface QuestionProps {
  database: Database;
  question: DatabaseFormQuestion;
  value: DatabaseCellInput | undefined;
  invalid: boolean;
  onChange: (fieldId: string, value: DatabaseCellInput) => void;
}

const Question = observer(function Question_({
  database,
  question,
  value,
  invalid,
  onChange,
}: QuestionProps) {
  const { t } = useTranslation();
  const { field, required } = question;
  const labelId = React.useId();
  const handleChange = React.useCallback(
    (next: DatabaseCellInput) => onChange(field.id, next),
    [field.id, onChange]
  );
  const isChoice =
    field.type === DatabaseFieldType.SingleSelect ||
    field.type === DatabaseFieldType.MultipleSelect;
  // Typed answers get a plain field, as in Notion's forms, rather than a cell to click into.
  const isTyped =
    field.type === DatabaseFieldType.SingleLineText ||
    field.type === DatabaseFieldType.LongText ||
    field.type === DatabaseFieldType.Number;
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const handleTyped = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = event.target.value;
      if (field.type !== DatabaseFieldType.Number) {
        onChange(field.id, raw);
        return;
      }
      const number = Number(raw.replace(",", "."));
      onChange(
        field.id,
        raw.trim() === "" || Number.isNaN(number) ? null : number
      );
    },
    [field.id, field.type, onChange]
  );

  return (
    <Field>
      <QuestionLabel id={labelId}>
        {field.name}
        {required && <Required aria-label={t("Required")}> *</Required>}
      </QuestionLabel>
      {field.description && <Help>{field.description}</Help>}
      {isTyped ? (
        field.type === DatabaseFieldType.LongText ? (
          <TextAnswer
            as="textarea"
            rows={4}
            aria-labelledby={labelId}
            aria-invalid={invalid}
            value={text}
            onChange={handleTyped}
          />
        ) : (
          <TextAnswer
            type="text"
            inputMode={
              field.type === DatabaseFieldType.Number ? "decimal" : undefined
            }
            aria-labelledby={labelId}
            aria-invalid={invalid}
            value={text}
            onChange={handleTyped}
          />
        )
      ) : isChoice ? (
        <ChoiceQuestion
          field={field}
          value={value}
          onChange={handleChange}
          labelledBy={labelId}
        />
      ) : (
        <CellValueField
          database={database}
          field={field}
          value={value}
          label={field.name}
          invalid={invalid}
          onChange={handleChange}
        />
      )}
      {invalid && <Missing>{t("This question is required.")}</Missing>}
    </Field>
  );
});

const Page = styled.main`
  min-height: 100vh;
  padding-bottom: 64px;
  background: ${s("background")};
`;

const Cover = styled.img`
  display: block;
  width: 100%;
  height: 200px;
  object-fit: cover;
`;

const Sheet = styled.div`
  max-width: 640px;
  margin: 0 auto;
  padding: 48px 20px 0;
`;

const Logo = styled.img`
  width: 64px;
  height: 64px;
  margin-bottom: 12px;
  border-radius: 12px;
  object-fit: cover;
`;

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
`;

const Description = styled.p`
  margin: 0 0 24px;
  color: ${s("textSecondary")};
  font-size: 15px;
  white-space: pre-wrap;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 22px;
`;

const QuestionLabel = styled.div`
  font-size: 15px;
  font-weight: 600;
`;

const Required = styled.span`
  color: ${s("danger")};
`;

const Help = styled.div`
  color: ${s("textTertiary")};
  font-size: 13px;
  white-space: pre-wrap;
`;

const TextAnswer = styled.input`
  width: 100%;
  padding: 8px 10px;
  font: inherit;
  font-size: 15px;
  color: ${s("text")};
  background: ${s("background")};
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${s("inputBorderFocused")};
  }

  &[aria-invalid="true"] {
    border-color: ${s("danger")};
  }
`;

const Missing = styled.p`
  margin: 0 0 12px;
  color: ${s("danger")};
  font-size: 13px;
`;

const Honeypot = styled.div`
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
`;

const Sent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding-top: 16px;
  font-size: 16px;

  svg {
    fill: ${s("accent")};
  }

  p {
    margin: 0;
    white-space: pre-wrap;
  }
`;

import type { TFunction } from "i18next";
import type {
  DatabaseAutomationAction,
  DatabaseAutomationActionType,
  DatabaseAutomationTrigger,
  DatabaseAutomationValue,
  DatabaseAutomationValueKind,
  PresentedDatabaseAutomation,
} from "@shared/databases/automations";
import { SLACK_WEBHOOK_PATTERN } from "@shared/databases/automations";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { AutomationDraft } from "./automationsApi";

/** Field types whose value an action can compute or pick. */
const settableTypes = new Set<DatabaseFieldType>([
  DatabaseFieldType.SingleLineText,
  DatabaseFieldType.LongText,
  DatabaseFieldType.Number,
  DatabaseFieldType.Rating,
  DatabaseFieldType.Checkbox,
  DatabaseFieldType.SingleSelect,
  DatabaseFieldType.MultipleSelect,
  DatabaseFieldType.Date,
  DatabaseFieldType.User,
  DatabaseFieldType.Link,
]);

/**
 * Returns the fields an action can write.
 *
 * @param fields the fields of a database.
 * @returns the fields, in order.
 */
export function settableFields(fields: DatabaseField[]): DatabaseField[] {
  return fields.filter(
    (field) =>
      settableTypes.has(field.type) && !field.isComputed && !field.isLookup
  );
}

/**
 * Returns the kinds of values an action can write into a field.
 *
 * @param field the field written.
 * @param sourceDatabaseId the automation's database, whose rows a link field
 * can point to.
 * @returns the kinds, the default first.
 */
export function valueKindsFor(
  field: DatabaseField,
  sourceDatabaseId?: string
): DatabaseAutomationValueKind[] {
  switch (field.type) {
    case DatabaseFieldType.SingleLineText:
    case DatabaseFieldType.LongText:
      return ["template", "clear"];
    case DatabaseFieldType.Date:
      return ["now", "static", "clear"];
    case DatabaseFieldType.User:
      return ["me", "static", "clear"];
    case DatabaseFieldType.Link:
      return field.options.foreignDatabaseId &&
        field.options.foreignDatabaseId === sourceDatabaseId
        ? ["record", "clear"]
        : ["clear"];
    default:
      return ["static", "clear"];
  }
}

/**
 * Returns the value an action writes into a field until someone picks one.
 *
 * @param field the field written.
 * @param sourceDatabaseId the automation's database.
 * @returns the value.
 */
export function defaultValueFor(
  field: DatabaseField,
  sourceDatabaseId?: string
): DatabaseAutomationValue {
  const [kind] = valueKindsFor(field, sourceDatabaseId);
  switch (kind) {
    case "template":
      return { kind, text: "" };
    case "static":
      return {
        kind,
        value: field.type === DatabaseFieldType.Checkbox ? true : null,
      };
    default:
      return { kind };
  }
}

/**
 * Returns the label of a kind of value.
 *
 * @param kind the kind.
 * @param t the translation function.
 * @returns the label.
 */
export function valueKindLabel(
  kind: DatabaseAutomationValueKind,
  t: TFunction
): string {
  switch (kind) {
    case "static":
      return t("A value");
    case "template":
      return t("Text");
    case "now":
      return t("Today");
    case "me":
      return t("Person who triggered");
    case "record":
      return t("The triggering row");
    case "clear":
      return t("Empty");
    default:
      return kind;
  }
}

/**
 * Returns the label of a kind of action.
 *
 * @param type the kind.
 * @param t the translation function.
 * @returns the label.
 */
export function actionTypeLabel(
  type: DatabaseAutomationActionType,
  t: TFunction
): string {
  switch (type) {
    case "setProperty":
      return t("Edit property");
    case "notify":
      return t("Send notification");
    case "slack":
      return t("Send Slack message");
    case "createRecord":
      return t("Add row");
    default:
      return type;
  }
}

/**
 * Describes a trigger in one sentence, Notion-like.
 *
 * @param trigger the trigger.
 * @param fields the fields of the database.
 * @param t the translation function.
 * @returns the sentence.
 */
export function triggerSummary(
  trigger: DatabaseAutomationTrigger,
  fields: DatabaseField[],
  t: TFunction
): string {
  if (trigger.type === "recordCreated") {
    return t("When a row is added");
  }
  const property =
    fields.find((field) => field.id === trigger.fieldId)?.name ??
    t("a deleted property");
  if (trigger.type === "buttonClicked") {
    return t("When {{ property }} is clicked", { property });
  }
  if (trigger.to?.length) {
    return t("When {{ property }} is set to {{ values }}", {
      property,
      values: trigger.to.map(valueText(t)).join(", "),
    });
  }
  return t("When {{ property }} changes", { property });
}

/**
 * Describes an action in a few words.
 *
 * @param action the action.
 * @param fields the fields of the database.
 * @param t the translation function.
 * @returns the description.
 */
export function actionSummary(
  action: DatabaseAutomationAction,
  fields: DatabaseField[],
  t: TFunction
): string {
  switch (action.type) {
    case "setProperty": {
      const property =
        fields.find((field) => field.id === action.fieldId)?.name ??
        t("a deleted property");
      return t("Set {{ property }} to {{ value }}", {
        property,
        value: valueSummary(action.value, t),
      });
    }
    case "notify":
      return t("Notify people");
    case "slack":
      return t("Post to Slack");
    case "createRecord":
      return t("Add a row to a database");
    default:
      return "";
  }
}

/**
 * Returns an empty automation: when a row is added, with no action yet.
 *
 * @returns the draft.
 */
export function emptyDraft(): AutomationDraft {
  return {
    name: "",
    enabled: true,
    trigger: { type: "recordCreated" },
    conditions: null,
    actions: [],
  };
}

/**
 * Returns the draft of a saved automation.
 *
 * @param automation the automation.
 * @returns the draft.
 */
export function draftFromAutomation(
  automation: PresentedDatabaseAutomation
): AutomationDraft {
  return {
    name: automation.name,
    enabled: automation.enabled,
    trigger: automation.trigger,
    conditions: automation.conditions,
    actions: automation.actions,
  };
}

/**
 * Returns a new action of a kind, preset on the first field it can write.
 *
 * @param type the kind of action.
 * @param fields the fields of the database.
 * @param databaseId the automation's database, where « Add row » adds by default.
 * @param sourceDatabaseId the automation's database.
 * @returns the action.
 */
export function newAction(
  type: DatabaseAutomationActionType,
  fields: DatabaseField[],
  databaseId: string,
  sourceDatabaseId?: string
): DatabaseAutomationAction {
  switch (type) {
    case "setProperty": {
      const field =
        settableFields(fields).find(
          (item) => item.type === DatabaseFieldType.Date
        ) ?? settableFields(fields)[0];
      return {
        type,
        fieldId: field?.id ?? "",
        value: field
          ? defaultValueFor(field, sourceDatabaseId)
          : { kind: "clear" },
      };
    }
    case "notify":
      return { type, userIds: [], message: "" };
    case "slack":
      return { type, webhookUrl: "", message: "" };
    case "createRecord":
    default:
      return { type: "createRecord", databaseId, fields: {} };
  }
}

/**
 * Tells what keeps a draft from being saved.
 *
 * @param draft the automation being edited.
 * @param t the translation function.
 * @returns the problem, or null when the draft can be saved.
 */
export function draftProblem(
  draft: AutomationDraft,
  t: TFunction
): string | null {
  if (draft.trigger.type !== "recordCreated" && !draft.trigger.fieldId) {
    return t("Choose the property that starts the automation.");
  }
  if (!draft.actions.length) {
    return t("Add at least one action.");
  }
  for (const action of draft.actions) {
    if (action.type === "setProperty" && !action.fieldId) {
      return t("Choose the property to edit.");
    }
    if (
      action.type === "notify" &&
      !action.userIds?.length &&
      !action.personFieldId
    ) {
      return t("Choose who to notify.");
    }
    if (
      action.type === "slack" &&
      !SLACK_WEBHOOK_PATTERN.test(action.webhookUrl)
    ) {
      return t("Paste the address of a Slack incoming webhook.");
    }
  }
  return null;
}

function valueSummary(value: DatabaseAutomationValue, t: TFunction): string {
  switch (value.kind) {
    case "static":
      return Array.isArray(value.value)
        ? value.value.map(valueText(t)).join(", ")
        : valueText(t)(value.value);
    case "template":
      return value.text ? `« ${value.text} »` : t("Empty");
    default:
      return valueKindLabel(value.kind, t).toLocaleLowerCase();
  }
}

function valueText(t: TFunction) {
  return (value: unknown): string => {
    if (value === true || value === "true") {
      return t("Checked");
    }
    if (value === false || value === "false") {
      return t("Unchecked");
    }
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (value === null || value === undefined) {
      return t("Empty");
    }
    return t("a person");
  };
}

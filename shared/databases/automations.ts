import type { DatabaseCellInput, DatabaseFilter } from "./types";

/**
 * Automations of a database, Notion-like: when a row is created, a property
 * changes or a button is clicked, and the row matches the conditions, run
 * actions. Outline runs them (the community edition of Teable has none).
 */

/** What starts an automation. */
export type DatabaseAutomationTrigger =
  | DatabaseRecordCreatedTrigger
  | DatabasePropertyChangedTrigger
  | DatabaseButtonClickedTrigger;

export interface DatabaseRecordCreatedTrigger {
  type: "recordCreated";
}

export interface DatabasePropertyChangedTrigger {
  type: "propertyChanged";
  fieldId: string;
  /**
   * Only when the new value is one of these: choice names, "true" or "false"
   * for a checkbox, the text of other values. Any change when empty.
   */
  to?: string[];
}

export interface DatabaseButtonClickedTrigger {
  type: "buttonClicked";
  fieldId: string;
}

export type DatabaseAutomationTriggerType = DatabaseAutomationTrigger["type"];

/** A value an action writes into a cell. */
export type DatabaseAutomationValue =
  | DatabaseAutomationStaticValue
  | DatabaseAutomationTemplateValue
  | { kind: "now" }
  | { kind: "me" }
  | { kind: "clear" }
  | { kind: "record" };

export interface DatabaseAutomationStaticValue {
  kind: "static";
  value: DatabaseCellInput;
}

/** Text with variables: {{title}}, {{url}}, {{database}}, {{actor}}, {{property:Name}}. */
export interface DatabaseAutomationTemplateValue {
  kind: "template";
  text: string;
}

export type DatabaseAutomationValueKind = DatabaseAutomationValue["kind"];

/** What an automation does. */
export type DatabaseAutomationAction =
  | DatabaseSetPropertyAction
  | DatabaseNotifyAction
  | DatabaseSlackAction
  | DatabaseCreateRecordAction;

export interface DatabaseSetPropertyAction {
  type: "setProperty";
  fieldId: string;
  value: DatabaseAutomationValue;
}

/** Notifies people with a comment mentioning them on the row's page. */
export interface DatabaseNotifyAction {
  type: "notify";
  /** Outline users. */
  userIds?: string[];
  /** A person field of the row whose people are notified too. */
  personFieldId?: string;
  message: string;
}

/** Posts to a Slack incoming webhook. */
export interface DatabaseSlackAction {
  type: "slack";
  webhookUrl: string;
  message: string;
}

export interface DatabaseCreateRecordAction {
  type: "createRecord";
  /** The Outline database the row is created in, this one or another. */
  databaseId: string;
  fields: Record<string, DatabaseAutomationValue>;
}

export type DatabaseAutomationActionType = DatabaseAutomationAction["type"];

/** An automation as the API presents it. */
export interface PresentedDatabaseAutomation {
  id: string;
  databaseId: string;
  name: string;
  enabled: boolean;
  trigger: DatabaseAutomationTrigger;
  conditions: DatabaseFilter | null;
  actions: DatabaseAutomationAction[];
  createdById: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DatabaseAutomationLimits = {
  /** How many automations may follow one another's writes. */
  maxDepth: 3,
  maxActions: 10,
  maxPerDatabase: 50,
  /** Rows handled for one change; a bulk import does not run automations. */
  maxRecordsPerChange: 100,
};

/** The Slack incoming webhook address, the only one Slack actions post to. */
export const SLACK_WEBHOOK_PATTERN =
  /^https:\/\/hooks\.slack\.com\/[A-Za-z0-9/_-]+$/;

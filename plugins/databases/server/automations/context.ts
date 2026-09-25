import type { DatabaseField, DatabaseRecord } from "@shared/databases/types";
import env from "@server/env";
import type { Database, DatabaseAutomation, User } from "@server/models";
import type { DatabaseEngine } from "../engine/DatabaseEngine";
import { cellText } from "../utils/cellText";
import type { TemplateVariables } from "./templates";
import { cellMessageText } from "./templates";

/** Everything an action needs to run on one row. */
export interface AutomationRunContext {
  automation: DatabaseAutomation;
  database: Database;
  /** The engine of the database, writing with the automation's origin. */
  engine: DatabaseEngine;
  /** Returns the engine of another database, writing with the automation's origin. */
  engineFor: (database: Database) => DatabaseEngine;
  /** The fields of the database. */
  fields: DatabaseField[];
  /** The row, its people matched to Outline users. */
  record: DatabaseRecord;
  /** The person whose change or click triggered the run, when a member of the team. */
  actor: User | null;
  /** The person who set the automation up, when still an active member of the team. */
  author: User | null;
  now: Date;
}

/**
 * Returns the title of the row of a run: the text of its primary field.
 *
 * @param context the run.
 * @returns the title.
 */
export function rowTitle(context: AutomationRunContext): string {
  const primary = context.fields.find((field) => field.isPrimary);
  return primary ? cellText(context.record.fields[primary.id]) : "";
}

/**
 * Returns the address of the row of a run, which opens its page.
 *
 * @param context the run.
 * @returns the absolute URL.
 */
export function rowUrl(context: AutomationRunContext): string {
  return `${env.URL}/db/${context.database.id}/row/${context.record.id}`;
}

/**
 * Returns the values of message variables for a run.
 *
 * @param context the run.
 * @returns the variables.
 */
export function templateVariablesFor(
  context: AutomationRunContext
): TemplateVariables {
  return {
    title: rowTitle(context),
    url: rowUrl(context),
    database: context.database.title,
    actor: context.actor?.name ?? "",
    property: (name) => {
      const wanted = name.trim().toLocaleLowerCase();
      const field = context.fields.find(
        (item) => item.name.trim().toLocaleLowerCase() === wanted
      );
      return field
        ? cellMessageText(field, context.record.fields[field.id])
        : undefined;
    },
  };
}

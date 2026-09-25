import type {
  DatabaseAutomationAction,
  DatabaseAutomationTrigger,
  DatabaseAutomationValue,
} from "@shared/databases/automations";
import { SLACK_WEBHOOK_PATTERN } from "@shared/databases/automations";
import type { DatabaseField, DatabaseFilter } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { ValidationError } from "@server/errors";
import { Database, User } from "@server/models";
import { can } from "@server/policies";
import { engineFor, refFor } from "../engine";
import { actorFor } from "../utils/actor";
import { isDateField, isPersonField, isWritableField } from "./cellValues";

/** The parts of an automation checked against the database. */
export interface AutomationConfig {
  trigger: DatabaseAutomationTrigger;
  conditions: DatabaseFilter | null;
  actions: DatabaseAutomationAction[];
}

/**
 * Checks an automation against its database before it is saved: the fields
 * it names exist and take the values it writes, the people it notifies are
 * members of the team, and the other databases it writes are ones the editor
 * may edit.
 */
export class AutomationValidator {
  /**
   * @param user the person saving the automation.
   * @param database the database of the automation.
   * @param fields the fields of the database.
   */
  constructor(
    private readonly user: User,
    private readonly database: Database,
    private readonly fields: DatabaseField[]
  ) {}

  /**
   * Checks an automation.
   *
   * @param config the trigger, conditions and actions.
   * @throws ValidationError describing the first problem.
   */
  public async validate(config: AutomationConfig): Promise<void> {
    this.validateTrigger(config.trigger);
    if (config.conditions) {
      this.validateConditions(config.conditions);
    }
    for (const action of config.actions) {
      await this.validateAction(action);
    }
  }

  private validateTrigger(trigger: DatabaseAutomationTrigger) {
    if (trigger.type === "recordCreated") {
      return;
    }
    const field = this.field(this.fields, trigger.fieldId, "trigger");
    if (
      trigger.type === "buttonClicked" &&
      field.type !== DatabaseFieldType.Button
    ) {
      throw ValidationError("A button trigger needs a button property");
    }
  }

  private validateConditions(filter: DatabaseFilter) {
    for (const node of filter.filterSet) {
      if ("filterSet" in node) {
        this.validateConditions(node);
      } else {
        this.field(this.fields, node.fieldId, "condition");
      }
    }
  }

  private async validateAction(action: DatabaseAutomationAction) {
    switch (action.type) {
      case "setProperty": {
        const field = this.writableField(this.fields, action.fieldId);
        this.validateValue(action.value, field);
        return;
      }
      case "notify":
        return this.validateNotify(action.userIds ?? [], action.personFieldId);
      case "slack":
        if (!SLACK_WEBHOOK_PATTERN.test(action.webhookUrl)) {
          throw ValidationError(
            "The Slack webhook must be an address of hooks.slack.com"
          );
        }
        return;
      case "createRecord": {
        const target = await this.targetDatabase(action.databaseId);
        const fields =
          target.id === this.database.id
            ? this.fields
            : (
                await engineFor(target).getSchema(
                  actorFor(this.user),
                  refFor(target)
                )
              ).fields;
        for (const [fieldId, value] of Object.entries(action.fields)) {
          this.validateValue(value, this.writableField(fields, fieldId));
        }
        return;
      }
      default:
        return;
    }
  }

  private async validateNotify(userIds: string[], personFieldId?: string) {
    if (!userIds.length && !personFieldId) {
      throw ValidationError("A notification needs people to notify");
    }
    if (personFieldId) {
      const field = this.field(this.fields, personFieldId, "notification");
      if (!isPersonField(field)) {
        throw ValidationError(
          "People to notify must come from a person property"
        );
      }
    }
    if (userIds.length) {
      const count = await User.count({
        where: { id: userIds, teamId: this.database.teamId },
      });
      if (count !== new Set(userIds).size) {
        throw ValidationError("A person to notify is not a member of the team");
      }
    }
  }

  private validateValue(value: DatabaseAutomationValue, field: DatabaseField) {
    const mismatch = (kind: string) =>
      ValidationError(`« ${field.name} » cannot be set to ${kind}`);
    switch (value.kind) {
      case "now":
        if (!isDateField(field)) {
          throw mismatch("today's date");
        }
        return;
      case "me":
        if (field.type !== DatabaseFieldType.User) {
          throw mismatch("the person who made the change");
        }
        return;
      case "record":
        if (
          field.type !== DatabaseFieldType.Link ||
          field.options.foreignTableId !== this.database.externalTableId
        ) {
          throw mismatch("the row that triggered the automation");
        }
        return;
      default:
        return;
    }
  }

  private async targetDatabase(databaseId: string): Promise<Database> {
    if (databaseId === this.database.id) {
      return this.database;
    }
    const target = await Database.findByPkForUser(databaseId, this.user.id);
    if (!target || target.teamId !== this.database.teamId) {
      throw ValidationError("The database to add a row to does not exist");
    }
    if (!can(this.user, "update", target)) {
      throw ValidationError("You may not add rows to that database");
    }
    return target;
  }

  private field(
    fields: DatabaseField[],
    fieldId: string,
    use: string
  ): DatabaseField {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) {
      throw ValidationError(
        `The ${use} refers to a property that does not exist`
      );
    }
    return field;
  }

  private writableField(
    fields: DatabaseField[],
    fieldId: string
  ): DatabaseField {
    const field = this.field(fields, fieldId, "action");
    if (!isWritableField(field)) {
      throw ValidationError(`« ${field.name} » is computed and cannot be set`);
    }
    return field;
  }
}

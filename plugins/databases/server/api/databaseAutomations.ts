import Router from "koa-router";
import { DatabaseAutomationLimits } from "@shared/databases/automations";
import { DatabaseFieldType } from "@shared/databases/types";
import { NotFoundError, ValidationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import type { User } from "@server/models";
import { DatabaseAutomation } from "@server/models";
import type { Database } from "@server/models";
import type { APIContext } from "@server/types";
import { AutomationValidator } from "../automations/AutomationValidator";
import { DatabaseAutomationRunner } from "../automations/DatabaseAutomationRunner";
import { presentDatabaseAutomation } from "../automations/presenter";
import { engineFor, refFor } from "../engine";
import { actorFor } from "../utils/actor";
import {
  DatabaseRateLimit,
  authenticatedUser,
  loadDatabase,
} from "../utils/routeHelpers";
import * as T from "./automationSchema";

const router = new Router();

router.post(
  "databaseAutomations.list",
  rateLimiter(DatabaseRateLimit.Read),
  auth({ optional: true }),
  validate(T.DatabaseAutomationsListSchema),
  async (ctx: APIContext<T.DatabaseAutomationsListReq>) => {
    const user = authenticatedUser(ctx);
    const database = await loadDatabase(
      user,
      ctx.input.body.databaseId,
      "update"
    );

    const automations = await DatabaseAutomation.findAll({
      where: { databaseId: database.id },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
    });

    ctx.body = { data: automations.map(presentDatabaseAutomation) };
  }
);

router.post(
  "databaseAutomations.create",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseAutomationsCreateSchema),
  async (ctx: APIContext<T.DatabaseAutomationsCreateReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, name, enabled, trigger, conditions, actions } =
      ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const count = await DatabaseAutomation.count({ where: { databaseId } });
    if (count >= DatabaseAutomationLimits.maxPerDatabase) {
      throw ValidationError("This database has too many automations");
    }
    const check = await validator(user, database);
    await check.validate({ trigger, conditions: conditions ?? null, actions });

    const automation = await DatabaseAutomation.create({
      teamId: database.teamId,
      databaseId,
      name,
      enabled,
      trigger,
      conditions: conditions ?? null,
      actions,
      createdById: user.id,
    });

    ctx.body = { data: presentDatabaseAutomation(automation) };
  }
);

router.post(
  "databaseAutomations.update",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseAutomationsUpdateSchema),
  async (ctx: APIContext<T.DatabaseAutomationsUpdateReq>) => {
    const user = authenticatedUser(ctx);
    const { id, name, enabled, trigger, conditions, actions } = ctx.input.body;
    const { automation, database } = await loadAutomation(user, id);

    if (trigger || conditions !== undefined || actions) {
      const check = await validator(user, database);
      await check.validate({
        trigger: trigger ?? automation.trigger,
        conditions:
          conditions === undefined ? automation.conditions : conditions,
        actions: actions ?? automation.actions,
      });
    }
    if (name !== undefined) {
      automation.name = name;
    }
    if (enabled !== undefined) {
      automation.enabled = enabled;
    }
    if (trigger) {
      automation.trigger = trigger;
    }
    if (conditions !== undefined) {
      automation.conditions = conditions;
    }
    if (actions) {
      automation.actions = actions;
    }
    if (trigger || actions || conditions !== undefined) {
      // The editor takes the automation over: writes to other databases are
      // checked against their rights from now on.
      automation.createdById = user.id;
      automation.lastError = null;
    }
    await automation.save();

    ctx.body = { data: presentDatabaseAutomation(automation) };
  }
);

router.post(
  "databaseAutomations.delete",
  rateLimiter(DatabaseRateLimit.Schema),
  auth({ optional: true }),
  validate(T.DatabaseAutomationsDeleteSchema),
  async (ctx: APIContext<T.DatabaseAutomationsDeleteReq>) => {
    const user = authenticatedUser(ctx);
    const { automation } = await loadAutomation(user, ctx.input.body.id);

    await automation.destroy();

    ctx.body = { success: true };
  }
);

router.post(
  "databaseRecords.clickButton",
  rateLimiter(DatabaseRateLimit.Write),
  auth({ optional: true }),
  validate(T.DatabaseRecordsClickButtonSchema),
  async (ctx: APIContext<T.DatabaseRecordsClickButtonReq>) => {
    const user = authenticatedUser(ctx);
    const { databaseId, recordId, fieldId } = ctx.input.body;
    const database = await loadDatabase(user, databaseId, "update");

    const actor = actorFor(user);
    const engine = engineFor(database);
    const [{ fields }] = await Promise.all([
      engine.getSchema(actor, refFor(database)),
      engine.getRecord(actor, refFor(database), recordId),
    ]);
    const field = fields.find((item) => item.id === fieldId);
    if (!field || field.type !== DatabaseFieldType.Button) {
      throw ValidationError("This property is not a button");
    }

    const automations = (
      await DatabaseAutomation.findAll({
        where: { databaseId: database.id, enabled: true },
        order: [["createdAt", "ASC"]],
      })
    ).filter(
      (automation) =>
        automation.trigger.type === "buttonClicked" &&
        automation.trigger.fieldId === fieldId
    );

    const runner = new DatabaseAutomationRunner();
    const errors: string[] = [];
    for (const automation of automations) {
      const result = await runner.run(automation, database, {
        recordIds: [recordId],
        actorId: user.id,
        depth: 1,
      });
      errors.push(...result.errors);
    }

    ctx.body = { data: { ran: automations.length, errors } };
  }
);

async function loadAutomation(
  user: User,
  id: string
): Promise<{ automation: DatabaseAutomation; database: Database }> {
  const automation = await DatabaseAutomation.findOne({
    where: { id, teamId: user.teamId },
  });
  if (!automation) {
    throw NotFoundError("Automation not found");
  }
  const database = await loadDatabase(user, automation.databaseId, "update");
  return { automation, database };
}

async function validator(
  user: User,
  database: Database
): Promise<AutomationValidator> {
  const { fields } = await engineFor(database).getSchema(
    actorFor(user),
    refFor(database)
  );
  return new AutomationValidator(user, database, fields);
}

export default router;

import { Hook, PluginManager } from "@server/utils/PluginManager";
import config from "../plugin.json";
import databaseAutomations from "./api/databaseAutomations";
import databaseDuplicate from "./api/databaseDuplicate";
import databaseFields from "./api/databaseFields";
import databaseForms from "./api/databaseForms";
import databaseRecordPages from "./api/databaseRecordPages";
import databaseRecords from "./api/databaseRecords";
import databases from "./api/databases";
import databaseViews from "./api/databaseViews";
import teableGateway from "./api/teableGateway";
import teableHooks from "./api/teableHooks";
import { DatabaseRecordAssignedEmail } from "./email/templates/DatabaseRecordAssignedEmail";
import { DatabaseAutomationProcessor } from "./automations/DatabaseAutomationProcessor";
import env from "./env";
import { ConvertImportedEmbedsProcessor } from "./processors/ConvertImportedEmbedsProcessor";
import { DatabaseAnchorMoveProcessor } from "./processors/DatabaseAnchorMoveProcessor";
import { DatabaseAnchorTitleProcessor } from "./processors/DatabaseAnchorTitleProcessor";
import { DatabaseAssignmentNotificationsProcessor } from "./processors/DatabaseAssignmentNotificationsProcessor";
import { DatabaseChangeTitleProcessor } from "./processors/DatabaseChangeTitleProcessor";
import { DatabaseRowTitleProcessor } from "./processors/DatabaseRowTitleProcessor";
import { ConvertTeableEmbedsTask } from "./tasks/ConvertTeableEmbedsTask";
import { MoveDatabaseEngineTask } from "./tasks/MoveDatabaseEngineTask";

PluginManager.add([
  { ...config, type: Hook.API, value: databases },
  { type: Hook.API, value: databaseRecords },
  { type: Hook.API, value: databaseRecordPages },
  { type: Hook.API, value: databaseFields },
  { type: Hook.API, value: databaseViews },
  { type: Hook.API, value: databaseAutomations },
  { type: Hook.API, value: databaseForms },
  { type: Hook.API, value: databaseDuplicate },
  { type: Hook.API, value: teableGateway },
  { type: Hook.Processor, value: DatabaseAutomationProcessor },
  { type: Hook.Processor, value: DatabaseRowTitleProcessor },
  { type: Hook.Processor, value: DatabaseChangeTitleProcessor },
  { type: Hook.Processor, value: DatabaseAnchorMoveProcessor },
  { type: Hook.Processor, value: DatabaseAnchorTitleProcessor },
  { type: Hook.Processor, value: DatabaseAssignmentNotificationsProcessor },
  { type: Hook.EmailTemplate, value: DatabaseRecordAssignedEmail },
]);

// Teable's webhook, and the tools that read Teable: its embeds in imported
// pages, and moving its bases into the Outline engine.
if (env.isTeableConfigured) {
  PluginManager.add([
    { type: Hook.API, value: teableHooks },
    { type: Hook.Processor, value: ConvertImportedEmbedsProcessor },
    { type: Hook.Task, value: ConvertTeableEmbedsTask },
    { type: Hook.Task, value: MoveDatabaseEngineTask },
  ]);
}

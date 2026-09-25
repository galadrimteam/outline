import { Hook, PluginManager } from "@server/utils/PluginManager";
import config from "../plugin.json";
import databaseFields from "./api/databaseFields";
import databaseRecordPages from "./api/databaseRecordPages";
import databaseRecords from "./api/databaseRecords";
import databases from "./api/databases";
import databaseViews from "./api/databaseViews";
import teableHooks from "./api/teableHooks";
import { DatabaseRecordAssignedEmail } from "./email/templates/DatabaseRecordAssignedEmail";
import env from "./env";
import { ConvertImportedEmbedsProcessor } from "./processors/ConvertImportedEmbedsProcessor";
import { DatabaseAnchorMoveProcessor } from "./processors/DatabaseAnchorMoveProcessor";
import { DatabaseAssignmentNotificationsProcessor } from "./processors/DatabaseAssignmentNotificationsProcessor";
import { DatabaseChangeTitleProcessor } from "./processors/DatabaseChangeTitleProcessor";
import { DatabaseRowTitleProcessor } from "./processors/DatabaseRowTitleProcessor";
import { ConvertTeableEmbedsTask } from "./tasks/ConvertTeableEmbedsTask";

const enabled = !!env.TEABLE_INTERNAL_URL && !!env.GALADRIM_SECRET;

if (enabled) {
  PluginManager.add([
    { ...config, type: Hook.API, value: databases },
    { type: Hook.API, value: databaseRecords },
    { type: Hook.API, value: databaseRecordPages },
    { type: Hook.API, value: databaseFields },
    { type: Hook.API, value: databaseViews },
    { type: Hook.API, value: teableHooks },
    { type: Hook.Processor, value: DatabaseRowTitleProcessor },
    { type: Hook.Processor, value: DatabaseChangeTitleProcessor },
    { type: Hook.Processor, value: DatabaseAnchorMoveProcessor },
    { type: Hook.Processor, value: ConvertImportedEmbedsProcessor },
    { type: Hook.Processor, value: DatabaseAssignmentNotificationsProcessor },
    { type: Hook.EmailTemplate, value: DatabaseRecordAssignedEmail },
    { type: Hook.Task, value: ConvertTeableEmbedsTask },
  ]);
}

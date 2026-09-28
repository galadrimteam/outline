import type { TFunction } from "i18next";
import type Database from "~/models/Database";
import type DialogsStore from "~/stores/DialogsStore";
import { AutomationsPanel } from "./AutomationsPanel";

interface Options {
  dialogs: DialogsStore;
  database: Database;
  t: TFunction;
}

/**
 * Opens the « ⚡ Automations » of a database in a dialog, for the database's
 * menu. Only people who may edit the database should be offered it.
 *
 * @param options the dialogs store, the database and the translation function.
 */
export function openDatabaseAutomations({ dialogs, database, t }: Options) {
  dialogs.openModal({
    title: `⚡ ${t("Automations")}`,
    content: <AutomationsPanel database={database} />,
    width: 720,
  });
}

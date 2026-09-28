import { uniq } from "es-toolkit/compat";
import type {
  DatabaseAutomationTrigger,
  DatabasePropertyChangedTrigger,
} from "@shared/databases/automations";
import { DatabaseAutomationLimits } from "@shared/databases/automations";
import type { DatabaseCellChange, DatabaseEvent } from "@server/types";
import { cellTokens, isEmptyCell, sameCell } from "./cellValues";

/** The data of a change, with the created rows when the receiver tells them apart. */
export type TriggerChangeData = DatabaseEvent["data"] & {
  createdRecordIds?: string[];
};

/**
 * Returns the rows of an engine change that fire an automation's trigger.
 *
 * @param trigger the automation's trigger.
 * @param data the change, as sent by the engine's webhook.
 * @returns the record ids, at most `maxRecordsPerChange`.
 */
export function triggeredRecordIds(
  trigger: DatabaseAutomationTrigger,
  data: TriggerChangeData
): string[] {
  const ids =
    trigger.type === "recordCreated"
      ? createdRecordIds(data)
      : trigger.type === "propertyChanged"
        ? changedRecordIds(trigger, data.changes ?? [])
        : [];
  return uniq(ids).slice(0, DatabaseAutomationLimits.maxRecordsPerChange);
}

/**
 * Returns the rows a change created. The receiver merges the events of a
 * batch, so when rows were also updated in it, the rows with before/after
 * values are taken as updated ones.
 *
 * @param data the change.
 * @returns the created record ids.
 */
export function createdRecordIds(data: TriggerChangeData): string[] {
  if (!data.kinds.includes("record.create")) {
    return [];
  }
  if (data.createdRecordIds) {
    return data.createdRecordIds;
  }
  const recordIds = data.recordIds ?? [];
  if (data.kinds.every((kind) => kind === "record.create")) {
    return recordIds;
  }
  const updated = new Set(
    (data.changes ?? []).map((change) => change.recordId)
  );
  return recordIds.filter((id) => !updated.has(id));
}

/**
 * Returns the rows whose property changed as the trigger asks: any change, or
 * a change that brings one of the trigger's values in.
 *
 * @param trigger the trigger.
 * @param changes the cell changes.
 * @returns the record ids.
 */
export function changedRecordIds(
  trigger: DatabasePropertyChangedTrigger,
  changes: DatabaseCellChange[]
): string[] {
  const targets = (trigger.to ?? []).map(normalize);
  return changes
    .filter((change) => {
      if (
        change.fieldId !== trigger.fieldId ||
        sameCell(change.before, change.after)
      ) {
        return false;
      }
      if (!targets.length) {
        return true;
      }
      const before = new Set(cellTokens(change.before).map(normalize));
      // An unchecked checkbox is sent empty.
      const after =
        change.before === true && isEmptyCell(change.after)
          ? ["false"]
          : cellTokens(change.after);
      return after
        .map(normalize)
        .some((token) => !before.has(token) && targets.includes(token));
    })
    .map((change) => change.recordId);
}

function normalize(text: string): string {
  return text.trim().toLocaleLowerCase();
}

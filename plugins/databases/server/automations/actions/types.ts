import type {
  DatabaseAutomationAction,
  DatabaseAutomationActionType,
} from "@shared/databases/automations";
import type { AutomationRunContext } from "../context";

/** Runs one kind of automation action on a row. */
export interface AutomationActionExecutor<A extends DatabaseAutomationAction> {
  /**
   * Runs the action.
   *
   * @param action the action, as configured.
   * @param context the run.
   * @throws when the action could not be done; the run records the message.
   */
  execute(action: A, context: AutomationRunContext): Promise<void>;
}

/** One executor per kind of action. */
export type AutomationExecutors = {
  [K in DatabaseAutomationActionType]: AutomationActionExecutor<
    Extract<DatabaseAutomationAction, { type: K }>
  >;
};

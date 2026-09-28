/** Where a write made by an automation comes from, echoed back by the engine. */
export interface AutomationOriginInfo {
  automationId: string;
  /** How many automations ran one after the other to make this write, from 1. */
  depth: number;
}

const pattern = /^automation:([0-9a-f-]{36}):(\d{1,2})$/;

/**
 * Returns the origin tag of a write made by an automation,
 * `automation:<id>:<depth>`: an automation ignores its own writes, and a chain
 * of automations stops at a bounded depth.
 *
 * @param automationId the automation.
 * @param depth the depth of the run making the write.
 * @returns the origin tag.
 */
export function formatAutomationOrigin(
  automationId: string,
  depth: number
): string {
  return `automation:${automationId}:${depth}`;
}

/**
 * Reads the origin tag of a change.
 *
 * @param origin the origin echoed by the engine.
 * @returns the automation and depth, or null for any other origin.
 */
export function parseAutomationOrigin(
  origin: string | null | undefined
): AutomationOriginInfo | null {
  const match = origin ? pattern.exec(origin) : null;
  if (!match) {
    return null;
  }
  return { automationId: match[1], depth: Number(match[2]) };
}

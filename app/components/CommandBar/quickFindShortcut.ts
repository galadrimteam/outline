import { isModKey } from "@shared/utils/keyboard";

/**
 * galadrim: Notion opens its quick find with Cmd/Ctrl+P as well as Cmd/Ctrl+K,
 * so the command bar answers to both. Alt and Shift are excluded: those
 * combinations present and publish a document. The key is compared without
 * case, because with Caps Lock on the browser reports "P" without a shift –
 * the browser's print dialog would open instead.
 *
 * @param event The keyboard event.
 * @returns true if the event is the bare Cmd/Ctrl+P shortcut.
 */
export function isQuickFindShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "p" &&
    isModKey(event) &&
    !event.altKey &&
    !event.shiftKey
  );
}

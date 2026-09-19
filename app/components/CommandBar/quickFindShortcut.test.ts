import { isQuickFindShortcut } from "./quickFindShortcut";

// The test environment is not macOS, so Ctrl is the platform modifier key.
const keydown = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("isQuickFindShortcut", () => {
  it("matches the bare Ctrl+P", () => {
    expect(isQuickFindShortcut(keydown({ key: "p", ctrlKey: true }))).toBe(
      true
    );
  });

  it("ignores P without the modifier, and other keys with it", () => {
    expect(isQuickFindShortcut(keydown({ key: "p" }))).toBe(false);
    expect(isQuickFindShortcut(keydown({ key: "k", ctrlKey: true }))).toBe(
      false
    );
  });

  it("leaves the present and publish shortcuts alone", () => {
    expect(
      isQuickFindShortcut(keydown({ key: "p", ctrlKey: true, altKey: true }))
    ).toBe(false);
    expect(
      isQuickFindShortcut(keydown({ key: "P", ctrlKey: true, shiftKey: true }))
    ).toBe(false);
    expect(
      isQuickFindShortcut(keydown({ key: "p", ctrlKey: true, shiftKey: true }))
    ).toBe(false);
  });
});

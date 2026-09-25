import { moveCell, navigationKey } from "./navigation";

describe("moveCell", () => {
  it("stops arrows at the edges", () => {
    expect(moveCell({ row: 0, col: 0 }, "ArrowUp", 3, 3)).toEqual({
      row: 0,
      col: 0,
    });
    expect(moveCell({ row: 2, col: 2 }, "ArrowRight", 3, 3)).toEqual({
      row: 2,
      col: 2,
    });
    expect(moveCell({ row: 1, col: 1 }, "ArrowDown", 3, 3)).toEqual({
      row: 2,
      col: 1,
    });
  });

  it("wraps Tab and Shift+Tab across rows", () => {
    expect(moveCell({ row: 0, col: 2 }, "Tab", 3, 3)).toEqual({
      row: 1,
      col: 0,
    });
    expect(moveCell({ row: 1, col: 0 }, "ShiftTab", 3, 3)).toEqual({
      row: 0,
      col: 2,
    });
    expect(moveCell({ row: 2, col: 2 }, "Tab", 3, 3)).toEqual({
      row: 2,
      col: 2,
    });
  });

  it("jumps to the row ends", () => {
    expect(moveCell({ row: 1, col: 1 }, "Home", 3, 3)).toEqual({
      row: 1,
      col: 0,
    });
    expect(moveCell({ row: 1, col: 1 }, "End", 3, 3)).toEqual({
      row: 1,
      col: 2,
    });
  });

  it("ignores empty tables", () => {
    expect(moveCell({ row: 0, col: 0 }, "ArrowDown", 0, 3)).toEqual({
      row: 0,
      col: 0,
    });
  });
});

describe("navigationKey", () => {
  it("reads arrows and tabs", () => {
    expect(navigationKey({ key: "Tab", shiftKey: true })).toBe("ShiftTab");
    expect(navigationKey({ key: "ArrowLeft", shiftKey: false })).toBe(
      "ArrowLeft"
    );
    expect(navigationKey({ key: "a", shiftKey: false })).toBeUndefined();
  });
});

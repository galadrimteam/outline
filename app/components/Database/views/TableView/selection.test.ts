import { nextSelection } from "./selection";

const ids = ["a", "b", "c", "d"];
const click = (patch: Partial<Parameters<typeof nextSelection>[2]> = {}) => ({
  ids,
  anchor: null,
  extend: false,
  toggle: false,
  ...patch,
});

describe("nextSelection", () => {
  it("selects the row of a handle alone", () => {
    expect(nextSelection(["a", "c"], "b", click())).toEqual(["b"]);
  });

  it("clears a row that was selected alone", () => {
    expect(nextSelection(["b"], "b", click())).toEqual([]);
  });

  it("adds or removes a row with Cmd or a checkbox", () => {
    expect(nextSelection(["a"], "c", click({ toggle: true }))).toEqual([
      "a",
      "c",
    ]);
    expect(nextSelection(["a", "c"], "a", click({ toggle: true }))).toEqual([
      "c",
    ]);
  });

  it("extends from the anchor with Shift", () => {
    expect(
      nextSelection(["a"], "c", click({ anchor: "a", extend: true }))
    ).toEqual(["a", "b", "c"]);
    expect(
      nextSelection([], "b", click({ anchor: "d", extend: true }))
    ).toEqual(["b", "c", "d"]);
  });
});

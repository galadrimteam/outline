import { positionsBetween } from "./positions";

describe("positionsBetween", () => {
  it("spreads positions evenly between two neighbours", () => {
    expect(positionsBetween(1, 2, 3)).toEqual([1.25, 1.5, 1.75]);
    expect(positionsBetween(0, 10, 1)).toEqual([5]);
  });

  it("follows the last position or precedes the first by steps of 1", () => {
    expect(positionsBetween(7, undefined, 2)).toEqual([8, 9]);
    expect(positionsBetween(undefined, 3, 2)).toEqual([1, 2]);
    expect(positionsBetween(undefined, 0.5, 1)).toEqual([-0.5]);
  });

  it("starts at 1 alone, and gives nothing for no position", () => {
    expect(positionsBetween(undefined, undefined, 3)).toEqual([1, 2, 3]);
    expect(positionsBetween(1, 2, 0)).toEqual([]);
  });

  it("keeps positions strictly between close neighbours", () => {
    const [position] = positionsBetween(1, 1 + 1e-9, 1);
    expect(position).toBeGreaterThan(1);
    expect(position).toBeLessThan(1 + 1e-9);
  });

  it("follows the first neighbour when the second is not after it", () => {
    expect(positionsBetween(5, 5, 2)).toEqual([6, 7]);
  });
});

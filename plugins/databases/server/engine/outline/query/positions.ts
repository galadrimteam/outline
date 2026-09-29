/**
 * Returns positions strictly between two neighbours, evenly spread: after
 * the last one they follow by steps of 1, before the first one they precede
 * it by steps of 1, and alone they are 1, 2, 3…
 *
 * @param before the position of the neighbour before, if any.
 * @param after the position of the neighbour after, if any.
 * @param count how many positions.
 * @returns the positions, ascending.
 */
export function positionsBetween(
  before: number | undefined,
  after: number | undefined,
  count: number
): number[] {
  const total = Math.max(0, Math.trunc(count));
  const indexes = Array.from({ length: total }, (_value, index) => index + 1);
  const low = isPosition(before) ? before : undefined;
  const high = isPosition(after) ? after : undefined;

  if (low !== undefined && high !== undefined && high > low) {
    const step = (high - low) / (total + 1);
    return indexes.map((index) => low + step * index);
  }
  if (low !== undefined) {
    return indexes.map((index) => low + index);
  }
  if (high !== undefined) {
    return indexes.map((index) => high - (total + 1 - index));
  }
  return indexes;
}

function isPosition(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

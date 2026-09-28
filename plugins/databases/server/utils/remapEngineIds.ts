/**
 * Replaces engine ids (tables, fields, views) wherever they appear in a JSON
 * value, keys included, the way the engine itself remaps a duplicated view.
 * Whole-value replacement keeps working when the shape gains new keys that
 * hold ids. Engine ids have a fixed length and a type prefix, so one never
 * contains another.
 *
 * @param value the JSON value.
 * @param ids the new id of each old id.
 * @returns a copy of the value with the ids replaced.
 */
export function remapEngineIds<T>(value: T, ids: Record<string, string>): T {
  if (value === undefined || value === null) {
    return value;
  }
  let json = JSON.stringify(value);
  for (const [from, to] of Object.entries(ids)) {
    if (from && from !== to) {
      json = json.split(from).join(to);
    }
  }
  const remapped: T = JSON.parse(json);
  return remapped;
}

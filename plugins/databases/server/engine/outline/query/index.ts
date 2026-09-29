import { computeBase } from "./computed/computeBase";
import { inferFieldType } from "./computed/inferType";
import type { OutlineQuery } from "./contract";
import { choicesFor, convertCell } from "./convert";
import { groupPoints } from "./groups";
import { normalizeInput } from "./normalize";
import { positionsBetween } from "./positions";
import { selectRecords } from "./select";
import { aggregate } from "./statistics";
import { cellText } from "./text";

/** The query layer of the Outline engine: pure functions of a base's data. */
export const outlineQuery: OutlineQuery = {
  computeBase,
  select: selectRecords,
  groupPoints,
  aggregate,
  inferType: inferFieldType,
  convertCell,
  choicesFor,
  normalizeInput,
  cellText,
  positionsBetween,
};

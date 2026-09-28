import { DatabaseFieldType } from "@shared/databases/types";
import { attachmentCell } from "./AttachmentCell";
import { checkboxCell } from "./CheckboxCell";
import { buttonCell, computedCell } from "./ComputedCell";
import { dateCell } from "./DateCell";
import { linkCell } from "./LinkCell";
import { numberCell } from "./NumberCell";
import { ratingCell } from "./RatingCell";
import { selectCell } from "./SelectCell";
import { longTextCell, textCell } from "./TextCell";
import type { CellDefinition } from "./types";
import { userCell } from "./UserCell";

export type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
  CellVariant,
} from "./types";

const cells: Record<DatabaseFieldType, CellDefinition> = {
  [DatabaseFieldType.SingleLineText]: textCell,
  [DatabaseFieldType.LongText]: longTextCell,
  [DatabaseFieldType.Number]: numberCell,
  [DatabaseFieldType.Rating]: ratingCell,
  [DatabaseFieldType.Checkbox]: checkboxCell,
  [DatabaseFieldType.SingleSelect]: selectCell,
  [DatabaseFieldType.MultipleSelect]: selectCell,
  [DatabaseFieldType.Date]: dateCell,
  [DatabaseFieldType.User]: userCell,
  [DatabaseFieldType.CreatedBy]: userCell,
  [DatabaseFieldType.LastModifiedBy]: userCell,
  [DatabaseFieldType.Attachment]: attachmentCell,
  [DatabaseFieldType.Link]: linkCell,
  [DatabaseFieldType.Rollup]: computedCell,
  [DatabaseFieldType.ConditionalRollup]: computedCell,
  [DatabaseFieldType.Formula]: computedCell,
  [DatabaseFieldType.AutoNumber]: computedCell,
  [DatabaseFieldType.CreatedTime]: computedCell,
  [DatabaseFieldType.LastModifiedTime]: computedCell,
  [DatabaseFieldType.Button]: buttonCell,
};

/**
 * How cells of a field type are drawn and edited. Adding a type means adding a cell module and a
 * line above; the views never switch on field types themselves.
 *
 * @param type the field type.
 * @returns the cell definition, a read-only text cell for unknown types.
 */
export function getCell(type: DatabaseFieldType): CellDefinition {
  return cells[type] ?? computedCell;
}

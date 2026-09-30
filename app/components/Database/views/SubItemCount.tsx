import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DatabaseRecord } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s } from "@shared/styles";
import type Database from "~/models/Database";
import { toArray } from "../cells/format";

/**
 * How many sub-items a row has, as Notion's cards say it (« ↳ 7 »), when the
 * database has sub-items.
 *
 * @param database the database.
 * @param record the row.
 * @returns the number of sub-items, 0 without any.
 */
export function subItemCount(
  database: Pick<Database, "settings" | "fieldById">,
  record: DatabaseRecord
): number {
  const fieldId = database.settings?.subItemFieldId;
  const field = fieldId ? database.fieldById(fieldId) : undefined;
  if (field?.type !== DatabaseFieldType.Link) {
    return 0;
  }
  return toArray(record.fields[field.id]).length;
}

/**
 * The « ↳ n » of a card whose row has sub-items.
 *
 * @param props the database and the row.
 * @returns the count, nothing for a row without sub-items.
 */
export const SubItemCount = observer(function SubItemCount({
  database,
  record,
}: {
  database: Database;
  record: DatabaseRecord;
}) {
  const { t } = useTranslation();
  const count = subItemCount(database, record);
  if (!count) {
    return null;
  }
  return (
    <Count aria-label={t("{{ count }} sub-items", { count })}>↳ {count}</Count>
  );
});

const Count = styled.span`
  align-self: flex-start;
  color: ${s("textTertiary")};
  font-size: 12px;
  font-variant-numeric: tabular-nums;
`;

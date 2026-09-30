import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DatabaseCellValue, DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { ellipsis, s } from "@shared/styles";
import type Database from "~/models/Database";
import { CheckboxBox } from "../cells/CheckboxCell";
import { getCell } from "../cells/registry";

interface Props {
  database: Database;
  /** The property the rows are grouped by. */
  field: DatabaseField;
  /** The value of the group; null, undefined or empty for the rows without one. */
  value: DatabaseCellValue | undefined;
}

/**
 * The title of a group of rows, as Notion writes it: the value drawn like a
 * card cell (a coloured option, a person, a linked page), a checkbox followed
 * by the property name for a checkbox, « No Property » for the rows without a
 * value.
 *
 * @param props the property and the value of the group.
 * @returns the title.
 */
export const GroupLabel = observer(function GroupLabel({
  database,
  field,
  value,
}: Props) {
  const { t } = useTranslation();

  if (field.type === DatabaseFieldType.Checkbox) {
    return (
      <Label>
        <CheckboxBox checked={value === true} />
        <Name>{field.name}</Name>
      </Label>
    );
  }
  if (isEmptyGroupValue(value)) {
    return <NoValue>{t("No {{ name }}", { name: field.name })}</NoValue>;
  }
  const { Renderer } = getCell(field.type);
  return (
    <Renderer field={field} database={database} value={value} variant="card" />
  );
});

/**
 * Whether a group holds the rows without a value.
 *
 * @param value the value of the group.
 * @returns true for null, undefined, "" and empty lists.
 */
export function isEmptyGroupValue(
  value: DatabaseCellValue | undefined
): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && !value.length)
  );
}

const Label = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const Name = styled.span`
  ${ellipsis()}
`;

const NoValue = styled.span`
  color: ${s("text")};
  ${ellipsis()}
`;

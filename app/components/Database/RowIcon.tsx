import { observer } from "mobx-react";
import styled from "styled-components";
import type { DatabaseRecord } from "@shared/databases/types";
import Icon from "@shared/components/Icon";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import type { RowIconValue } from "./rowIcons";
import { rowIcon } from "./rowIcons";

interface Props {
  database: Database;
  record: DatabaseRecord;
  size?: number;
  className?: string;
}

/**
 * Returns the icon of a row, following its page when the page is loaded so
 * that a new page icon shows at once.
 *
 * @param database the database.
 * @param record the row.
 * @returns the icon, or undefined when the row has none.
 */
export function useRowIcon(
  database: Database,
  record: DatabaseRecord
): RowIconValue | undefined {
  const { documents } = useStores();
  const page = record.documentId ? documents.get(record.documentId) : undefined;
  return rowIcon(database, record, page);
}

/**
 * The icon of a row before its title; nothing when the row has none.
 */
export const RowIcon = observer(function RowIcon({
  database,
  record,
  size = 18,
  className,
}: Props) {
  const icon = useRowIcon(database, record);
  return icon ? (
    <IconGlyph icon={icon} size={size} className={className} />
  ) : null;
});

/**
 * An icon of a row or of a linked row, sized like the text it precedes.
 *
 * @param props the icon, its size and class.
 * @returns the icon.
 */
export function IconGlyph({
  icon,
  size = 18,
  className,
}: {
  icon: RowIconValue;
  size?: number;
  className?: string;
}) {
  return (
    <Glyph className={className} aria-hidden>
      <Icon value={icon.value} color={icon.color} size={size} initial="" />
    </Glyph>
  );
}

const Glyph = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
`;

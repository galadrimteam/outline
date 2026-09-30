import { observer } from "mobx-react";
import { CollapsedIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import type Database from "~/models/Database";
import { getCell } from "../../cells/registry";
import type { AddDisplayRow, GroupDisplayRow } from "./rows";
import { NewButton, SpanningContent, SpanningLine } from "./styles";

interface PositionProps {
  index: number;
  start: number;
  template: string;
  measureElement: (element: Element | null) => void;
}

interface GroupProps extends PositionProps {
  database: Database;
  row: GroupDisplayRow;
  onToggle: (groupId: string) => void;
}

/**
 * The header of a group: fold button, the group value drawn like a cell, and the row count.
 *
 * @param props the group and its position.
 * @returns the header line.
 */
export const GroupHeaderRow = observer(function GroupHeaderRow_({
  database,
  row,
  index,
  start,
  template,
  measureElement,
  onToggle,
}: GroupProps) {
  const { t } = useTranslation();
  const field = database.fieldById(row.fieldId);
  const empty =
    row.value === null ||
    row.value === "" ||
    (Array.isArray(row.value) && !row.value.length);

  return (
    <GroupLine
      ref={measureElement}
      role="row"
      data-index={index}
      $template={template}
      style={{ transform: `translateY(${start}px)` }}
    >
      <GroupContent style={{ paddingLeft: 8 + row.depth * 20 }}>
        <Fold
          type="button"
          aria-expanded={!row.collapsed}
          aria-label={row.collapsed ? t("Expand group") : t("Collapse group")}
          $collapsed={row.collapsed}
          onClick={() => onToggle(row.groupId)}
        >
          <CollapsedIcon size={20} />
        </Fold>
        {field && !empty ? (
          <GroupValue field={field} database={database} value={row.value} />
        ) : (
          <NoValue>
            {field ? t("No {{ name }}", { name: field.name }) : t("Empty")}
          </NoValue>
        )}
        <Count>{row.count}</Count>
      </GroupContent>
    </GroupLine>
  );
});

function GroupValue({
  field,
  database,
  value,
}: {
  field: NonNullable<ReturnType<Database["fieldById"]>>;
  database: Database;
  value: GroupDisplayRow["value"];
}) {
  const { Renderer } = getCell(field.type);
  return (
    <Renderer field={field} database={database} value={value} variant="card" />
  );
}

interface AddProps extends PositionProps {
  row: AddDisplayRow;
  onCreate: (row: AddDisplayRow) => void;
}

/**
 * The « + New page » line closing a group, creating a row in it.
 *
 * @param props the group path and its position.
 * @returns the line.
 */
export function GroupAddRow({
  row,
  index,
  start,
  template,
  measureElement,
  onCreate,
}: AddProps) {
  const { t } = useTranslation();
  return (
    <GroupLine
      ref={measureElement}
      role="row"
      data-index={index}
      $template={template}
      style={{ transform: `translateY(${start}px)` }}
    >
      <SpanningContent>
        <NewButton type="button" onClick={() => onCreate(row)}>
          <PlusIcon size={18} />
          {t("New page")}
        </NewButton>
      </SpanningContent>
    </GroupLine>
  );
}

const GroupLine = styled(SpanningLine)`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  min-height: 34px;
`;

const GroupContent = styled(SpanningContent)`
  min-height: 40px;
  font-weight: 500;
`;

const Fold = styled.button<{ $collapsed: boolean }>`
  display: inline-flex;
  padding: 0;
  border: 0;
  background: none;
  color: ${s("textSecondary")};
  cursor: var(--pointer);
  transform: rotate(${(props) => (props.$collapsed ? "-90deg" : "0deg")});
  transition: transform 100ms ease;

  svg {
    fill: currentColor;
  }
`;

const NoValue = styled.span`
  color: ${s("textSecondary")};
`;

const Count = styled.span`
  font-weight: 400;
  color: ${s("textTertiary")};
`;

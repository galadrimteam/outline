import { observer } from "mobx-react";
import { CollapsedIcon, PlusIcon } from "outline-icons";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css } from "styled-components";
import { s } from "@shared/styles";
import type Database from "~/models/Database";
import { GroupLabel } from "../GroupLabel";
import type { AddDisplayRow, GroupDisplayRow } from "./rows";
import { NewButton, OpenLine, SpanningContent, SpanningLine } from "./styles";

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
 * The header of a group, like Notion's: fold button and the group's title; the row count shows
 * when the header is hovered.
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

  return (
    <GroupTitleLine
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
        {field ? (
          <GroupLabel database={database} field={field} value={row.value} />
        ) : (
          <NoValue>{t("Empty")}</NoValue>
        )}
        <Count>{row.count}</Count>
      </GroupContent>
    </GroupTitleLine>
  );
});

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

interface LineProps {
  index: number;
  start: number;
  measureElement: (element: Element | null) => void;
  /** Room left under the line, before the next group. */
  gap?: number;
  children: React.ReactNode;
}

/**
 * A line placed among the rows by the virtualizer: the column headers or the calculations that
 * Notion repeats in every group.
 *
 * @param props its position and content.
 * @returns the line.
 */
export function PositionedLine({
  index,
  start,
  measureElement,
  gap = 0,
  children,
}: LineProps) {
  return (
    <Positioned
      ref={measureElement}
      data-index={index}
      style={{ transform: `translateY(${start}px)`, paddingBottom: gap }}
    >
      {children}
    </Positioned>
  );
}

const Positioned = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
`;

const positioned = css`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  min-height: 34px;
`;

const GroupLine = styled(SpanningLine)`
  ${positioned}
`;

const GroupTitleLine = styled(OpenLine)`
  ${positioned}
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
  opacity: 0;
  transition: opacity 100ms ease;

  ${GroupLine}:hover & {
    opacity: 1;
  }
`;

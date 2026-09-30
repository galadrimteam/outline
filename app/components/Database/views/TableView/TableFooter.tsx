import { observer } from "mobx-react";
import { CheckmarkIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseStatisticFunc,
  DatabaseView,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import { Popover, PopoverTrigger } from "~/components/primitives/Popover";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { useCellLocale } from "../../cells/hooks";
import { MenuItem, MenuLabel, MenuPanel } from "../../fields/components";
import type { TableColumn } from "./layout";
import {
  formatStatistic,
  statisticFuncsFor,
  statisticLabel,
  statisticShortLabel,
} from "./statistics";
import { FooterCell, FooterLine, Gutter } from "./styles";

interface Props {
  database: Database;
  view: DatabaseView;
  columns: TableColumn[];
  template: string;
  readOnly: boolean;
  /** Results of the calculations, by field id. */
  results: Record<string, { value: number | string | null }>;
}

/**
 * The line of calculations under the table or under a group (Notion's "Calculate"): one per
 * column, picked from the functions the engine offers for its type and saved in the view.
 *
 * @param props the columns and the results.
 * @returns the footer line.
 */
export const TableFooter = observer(function TableFooter_({
  database,
  view,
  columns,
  template,
  readOnly,
  results,
}: Props) {
  const canEdit = !readOnly && !view.isLocked;
  const hasAny = columns.some(
    (column) => view.columnMeta[column.field.id]?.statisticFunc
  );
  if (!canEdit && !hasAny) {
    return null;
  }

  return (
    <FooterLine role="row" $template={template}>
      <Gutter role="presentation" />
      {columns.map((column) => (
        <FooterColumn
          key={column.field.id}
          database={database}
          view={view}
          column={column}
          canEdit={canEdit}
          result={results[column.field.id]?.value}
        />
      ))}
    </FooterLine>
  );
});

interface ColumnProps {
  database: Database;
  view: DatabaseView;
  column: TableColumn;
  canEdit: boolean;
  result: number | string | null | undefined;
}

const FooterColumn = observer(function FooterColumn_({
  database,
  view,
  column,
  canEdit,
  result,
}: ColumnProps) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const locale = useCellLocale();
  const [open, setOpen] = React.useState(false);
  const { field } = column;
  const func = view.columnMeta[field.id]?.statisticFunc ?? null;

  const handlePick = React.useCallback(
    (next: DatabaseStatisticFunc | null) => {
      setOpen(false);
      void databases
        .updateView(database.id, view.id, {
          columnMeta: { [field.id]: { statisticFunc: next } },
        })
        .catch(() => undefined);
    },
    [database.id, databases, field.id, view.id]
  );

  const content = func ? (
    <>
      <Label>{statisticShortLabel(func, t)}</Label>
      <Value>{formatStatistic(func, result, field, t, locale)}</Value>
    </>
  ) : (
    canEdit && <Placeholder data-placeholder>{t("Calculate")}</Placeholder>
  );

  const cell = (
    <FooterCell
      type="button"
      disabled={!canEdit}
      $frozen={column.frozen}
      $left={column.left}
    >
      {content}
    </FooterCell>
  );

  if (!canEdit) {
    return cell;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>{cell}</PopoverTrigger>
      <MenuPanel
        aria-label={t("Calculate")}
        side="top"
        align="end"
        width={220}
        shrink
      >
        <MenuItem type="button" onClick={() => handlePick(null)}>
          <MenuLabel>{t("None")}</MenuLabel>
          {!func && <CheckmarkIcon size={18} />}
        </MenuItem>
        {statisticFuncsFor(field).map((option) => (
          <MenuItem
            key={option}
            type="button"
            onClick={() => handlePick(option)}
          >
            <MenuLabel>{statisticLabel(option, t)}</MenuLabel>
            {func === option && <CheckmarkIcon size={18} />}
          </MenuItem>
        ))}
      </MenuPanel>
    </Popover>
  );
});

// A narrow column shortens the name of the calculation, never its value.
const Label = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  font-size: 11px;
  color: ${s("textTertiary")};
`;

const Value = styled.span`
  flex-shrink: 0;
  font-size: 13px;
  color: ${s("textSecondary")};
  font-variant-numeric: tabular-nums;
`;

const Placeholder = styled.span`
  opacity: 0;
  transition: opacity 100ms ease;
`;

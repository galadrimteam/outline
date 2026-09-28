import { observer } from "mobx-react";
import { MoreIcon, PadlockIcon, SortAscendingIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { countFilterRules, sanitizeFilter } from "@shared/databases/filters";
import type {
  DatabaseFilter,
  DatabaseSort,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { borderRadius, s } from "@shared/styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import Tooltip from "~/components/Tooltip";
import type Database from "~/models/Database";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import { ToolbarButton } from "./components";
import { FilterBuilder } from "./FilterBuilder";
import { GroupMenu, layoutSupportsGrouping } from "./GroupMenu";
import { FilterIcon, GroupByIcon, PropertiesIcon } from "./icons";
import { PropertiesMenu } from "./PropertiesMenu";
import { SortMenu } from "./SortMenu";
import { useViewUpdate } from "./useViewUpdate";
import {
  canSaveView,
  draftFilter,
  draftSort,
  isFilterDirty,
  isSortDirty,
  viewDrafts,
} from "./viewDrafts";
import { ViewSettings } from "./ViewSettings";
import { useDatabaseBlock } from "../DatabaseBlockContext";

interface Props {
  /** The database shown by the block. */
  database: Database;
  /** The active view. */
  view: DatabaseView;
  /** The rows of the view as the reader sees them. */
  query: RecordQuery;
  /** Whether the reader may only look. */
  readOnly: boolean;
}

/**
 * The right-aligned view toolbar of a database block, like Notion's: Filter,
 * Sort, Group, Properties and the view options. Filters and sorts are the
 * reader's own until someone who may update the view uses « Save for
 * everyone »; « Reset » brings the saved view back. The rows follow the
 * changes because the block builds its query with `viewQueryParams`.
 *
 * @param props the database, the view, its rows and the reader's rights.
 * @returns the toolbar.
 */
export const DatabaseToolbar = observer(function DatabaseToolbar({
  database,
  view,
  query,
  readOnly,
}: Props) {
  const { t } = useTranslation();
  const block = useDatabaseBlock();
  const update = useViewUpdate(database.id, view);
  const canSave = canSaveView(view, readOnly);
  const draft = viewDrafts.get(database.id, view.id);
  const filter = draftFilter(view, draft, canSave);
  const sort = draftSort(view, draft);
  const filterDirty = isFilterDirty(view, draft, canSave);
  const sortDirty = isSortDirty(view, draft);
  const filterCount =
    countFilterRules(filter) + (canSave ? 0 : countFilterRules(view.filter));
  const sortCount = sort?.sortObjs.length ?? 0;
  const isBoard = view.layout === DatabaseLayout.Board;
  const isGrouped = isBoard
    ? !!view.overrides.subGroupFieldId
    : !!view.group?.length;

  const handleFilterChange = React.useCallback(
    (next: DatabaseFilter | null) =>
      viewDrafts.set(
        database.id,
        view.id,
        canSave ? { filter: next } : { extraFilter: next }
      ),
    [database.id, view.id, canSave]
  );

  const handleSortChange = React.useCallback(
    (next: DatabaseSort | null) =>
      viewDrafts.set(database.id, view.id, { sort: next }),
    [database.id, view.id]
  );

  const handleReset = React.useCallback(
    () => viewDrafts.reset(database.id, view.id),
    [database.id, view.id]
  );

  const handleSave = React.useCallback(async () => {
    const saved = await update({
      ...(filterDirty
        ? { filter: sanitizeFilter(filter, (id) => database.fieldById(id)) }
        : {}),
      ...(sortDirty ? { sort: sort?.sortObjs.length ? sort : null } : {}),
    });
    if (saved) {
      viewDrafts.reset(database.id, view.id);
    }
  }, [update, filterDirty, sortDirty, filter, sort, database, view.id]);

  const handleToggleLock = React.useCallback(
    () => update({ isLocked: !view.isLocked }),
    [update, view.isLocked]
  );

  return (
    <Bar role="group" aria-label={t("View options")}>
      {(filterDirty || sortDirty) && (
        <Draft>
          <DraftButton type="button" onClick={handleReset}>
            {t("Reset")}
          </DraftButton>
          {canSave && (
            <DraftButton type="button" $primary onClick={handleSave}>
              {t("Save for everyone")}
            </DraftButton>
          )}
        </Draft>
      )}

      <ToolbarPopover
        label={t("Filter")}
        openRequest={block?.filterRequest?.at}
        count={filterCount}
        icon={<FilterIcon size={20} />}
        width={filter?.filterSet.length ? 680 : 300}
      >
        <FilterBuilder
          database={database}
          filter={filter}
          onChange={handleFilterChange}
          records={query.records}
          lockedFilter={canSave ? undefined : view.filter}
        />
      </ToolbarPopover>

      <ToolbarPopover
        label={t("Sort")}
        count={sortCount}
        icon={<SortAscendingIcon size={20} />}
        width={sortCount ? 420 : 300}
      >
        <SortMenu database={database} sort={sort} onChange={handleSortChange} />
      </ToolbarPopover>

      {canSave && layoutSupportsGrouping(view.layout) && (
        <ToolbarPopover
          label={isBoard ? t("Group by") : t("Group")}
          active={isGrouped}
          icon={<GroupByIcon size={20} />}
          width={400}
        >
          <GroupMenu database={database} view={view} onUpdate={update} />
        </ToolbarPopover>
      )}

      {canSave && (
        <ToolbarPopover
          label={t("Properties")}
          icon={<PropertiesIcon size={20} />}
          width={300}
        >
          <PropertiesMenu database={database} view={view} onUpdate={update} />
        </ToolbarPopover>
      )}

      {!readOnly && view.isLocked && (
        <Tooltip content={t("Unlock view")}>
          <ToolbarButton
            type="button"
            aria-label={t("Unlock view")}
            onClick={handleToggleLock}
          >
            <PadlockIcon size={20} />
            <Label>{t("Locked")}</Label>
          </ToolbarButton>
        </Tooltip>
      )}

      {!readOnly && (
        <ToolbarPopover
          label={t("View options")}
          icon={<MoreIcon size={20} />}
          width={320}
        >
          <ViewSettings database={database} view={view} onUpdate={update} />
        </ToolbarPopover>
      )}
    </Bar>
  );
});

interface ToolbarPopoverProps {
  /** Tooltip and accessible name of the button. */
  label: string;
  /** Icon of the button. */
  icon: React.ReactNode;
  /** Number shown next to the icon when above zero. */
  count?: number;
  /** Draws the button in the accent colour. */
  active?: boolean;
  /** Width of the popover. */
  width: number;
  /** The popover content. */
  children: React.ReactNode;
  /** Opens the popover each time it changes, eg « Filter » in a column menu. */
  openRequest?: number;
}

function ToolbarPopover({
  label,
  icon,
  count = 0,
  active,
  width,
  children,
  openRequest,
}: ToolbarPopoverProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (openRequest) {
      setOpen(true);
    }
  }, [openRequest]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <PopoverTrigger>
          <ToolbarButton
            type="button"
            aria-label={count ? `${label} (${count})` : label}
            $active={active || count > 0}
          >
            {icon}
            {count > 0 && <Count>{count}</Count>}
          </ToolbarButton>
        </PopoverTrigger>
      </Tooltip>
      <Content
        aria-label={label}
        align="end"
        width={width}
        shrink
        onOpenAutoFocus={(ev) => {
          if (!(ev.currentTarget instanceof HTMLElement)) {
            return;
          }
          const autofocus = ev.currentTarget.querySelector("input");
          if (autofocus) {
            ev.preventDefault();
            autofocus.focus();
          }
        }}
      >
        {children}
      </Content>
    </Popover>
  );
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-width: 0;
`;

const Content = styled(PopoverContent)`
  max-width: calc(100vw - 24px);
`;

const Count = styled.span`
  font-size: 13px;
  font-variant-numeric: tabular-nums;
`;

const Label = styled.span`
  font-size: 13px;
`;

const Draft = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-inline-end: 6px;
`;

const DraftButton = styled.button<{ $primary?: boolean }>`
  height: 26px;
  padding: 0 8px;
  border: 0;
  ${borderRadius(6)}
  background: ${(props) => (props.$primary ? props.theme.accent : "none")};
  color: ${(props) =>
    props.$primary ? props.theme.accentText : props.theme.textSecondary};
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: var(--pointer);

  &:hover {
    background: ${(props) =>
      props.$primary
        ? props.theme.accent
        : props.theme.listItemHoverBackground};
    filter: ${(props) => (props.$primary ? "brightness(0.95)" : "none")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: 1px;
  }
`;

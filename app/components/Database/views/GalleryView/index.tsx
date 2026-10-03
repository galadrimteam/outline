import { observer } from "mobx-react";
import { CollapsedIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { css, useTheme } from "styled-components";
import type {
  DatabaseCardSize,
  DatabaseCellInput,
  DatabaseField,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import { borderRadius, s } from "@shared/styles";
import type Database from "~/models/Database";
import {
  groupPrefill,
  groupRecords,
  viewGroupLayout,
} from "../../toolbar/grouping";
import type { RecordGroup } from "../../toolbar/grouping";
import type { DatabaseViewProps } from "../../types";
import {
  CardHeading,
  CardProperties,
  openableProps,
  recordCardColor,
  recordCover,
  visibleCardFields,
} from "./cards";
import { CommentCount } from "../../comments/CommentCount";
import { GroupLabel } from "../GroupLabel";
import { SubItemCount } from "../SubItemCount";
import { useAllRecords } from "../useAllRecords";

/**
 * Notion-like gallery: cards with a cover image (the view's cover property),
 * a title and the visible properties; small, medium or large; split in
 * collapsible sections when the view is grouped, each paged on its own.
 *
 * @param props the database, the view, its rows and the callbacks.
 * @returns the gallery.
 */
export const GalleryView = observer(function GalleryView({
  database,
  view,
  query,
  readOnly,
  onOpenRecord,
  onCreateRecord,
}: DatabaseViewProps) {
  const { t } = useTranslation();
  const size = view.overrides.cardSize ?? "medium";
  const fields = visibleCardFields(database, view);
  const groupLevel = view.group?.[0];
  const groupField = groupLevel
    ? database.fieldById(groupLevel.fieldId)
    : undefined;
  const canCreate = !readOnly && !!onCreateRecord;
  const rowsLeft = useAllRecords(query, !!groupField);

  React.useEffect(() => {
    void query.fetch();
  }, [query]);

  const renderCards = (records: DatabaseRecord[], prefill?: Prefill) => (
    <Grid $size={size}>
      {records.map((record) => (
        <GalleryCard
          key={record.id}
          database={database}
          view={view}
          record={record}
          fields={fields}
          size={size}
          cover={!!view.options.coverFieldId}
          coverFit={!!view.options.isCoverFit}
          showNames={view.options.isFieldNameHidden === false}
          coverOf={(r) => recordCover(view, r)}
          readOnly={readOnly}
          onOpen={onOpenRecord}
        />
      ))}
      {canCreate && (
        <NewCard
          type="button"
          onClick={() => void onCreateRecord?.(prefill)}
          $size={size}
        >
          <PlusIcon size={18} />
          {t("New page")}
        </NewCard>
      )}
    </Grid>
  );

  if (!query.isLoaded && query.isLoading) {
    return <Placeholder $size={size} aria-busy />;
  }

  return (
    <Wrapper>
      {groupField
        ? groupRecords(
            query.records,
            groupField,
            groupLevel?.order,
            viewGroupLayout(view.overrides)
          ).map((group) => (
            <GallerySection
              key={group.key}
              database={database}
              field={groupField}
              group={group}
              limit={query.params.pageSize}
            >
              {(records) => renderCards(records, prefillFor(groupField, group))}
            </GallerySection>
          ))
        : renderCards(query.records)}
      {!query.records.length && !canCreate && (
        <Empty>{t("No pages to show")}</Empty>
      )}
      {query.hasMore && (!groupField || rowsLeft) && (
        <LoadMore
          type="button"
          disabled={query.isLoading}
          onClick={() => void query.loadMore()}
        >
          {t("Load more")}
        </LoadMore>
      )}
    </Wrapper>
  );
});

type Prefill = Record<string, DatabaseCellInput> | undefined;

function prefillFor(field: DatabaseField, group: RecordGroup): Prefill {
  const value = groupPrefill(field, group);
  return value === undefined ? undefined : { [field.id]: value };
}

interface SectionProps {
  database: Database;
  field: DatabaseField;
  group: RecordGroup;
  /** The rows the group shows before its own « Load more », all when undefined. */
  limit?: number;
  /** Draws the rows shown. */
  children: (records: DatabaseRecord[]) => React.ReactNode;
}

/**
 * A collapsible group of a grouped view: its title, its count of rows (on
 * hover), its rows up to the view's load limit, then « Load more » for the
 * rest of the group, as Notion pages each group.
 *
 * @param props the group, its limit and how to draw its rows.
 * @returns the section.
 */
export const GallerySection = observer(function GallerySection({
  database,
  field,
  group,
  limit,
  children,
}: SectionProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = React.useState(false);
  const [shown, setShown] = React.useState(limit);
  const contentId = React.useId();

  React.useEffect(() => {
    setShown(limit);
  }, [limit]);

  const records =
    shown === undefined ? group.records : group.records.slice(0, shown);

  return (
    <Section>
      <SectionHeader
        type="button"
        aria-expanded={!collapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed((value) => !value)}
      >
        <Chevron $collapsed={collapsed}>
          <CollapsedIcon size={18} />
        </Chevron>
        <SectionValue>
          <GroupLabel database={database} field={field} value={group.value} />
        </SectionValue>
        <SectionCount>{group.records.length}</SectionCount>
      </SectionHeader>
      <div id={contentId} hidden={collapsed}>
        {!collapsed && children(records)}
      </div>
      {!collapsed &&
        limit !== undefined &&
        records.length < group.records.length && (
          <LoadMore
            type="button"
            onClick={() => setShown(records.length + limit)}
          >
            {t("Load more")}
          </LoadMore>
        )}
    </Section>
  );
});

interface CardProps {
  database: Database;
  view: DatabaseView;
  record: DatabaseRecord;
  fields: DatabaseField[];
  size: DatabaseCardSize;
  cover: boolean;
  coverFit: boolean;
  showNames: boolean;
  coverOf: (record: DatabaseRecord) => ReturnType<typeof recordCover>;
  readOnly: boolean;
  onOpen: (recordId: string) => void;
}

const GalleryCard = observer(function GalleryCard({
  database,
  view,
  record,
  fields,
  size,
  cover,
  coverFit,
  showNames,
  coverOf,
  readOnly,
  onOpen,
}: CardProps) {
  const theme = useTheme();
  const image = cover ? coverOf(record) : undefined;
  const background = recordCardColor(database, view, record, theme);

  return (
    <Card {...openableProps(() => onOpen(record.id))} style={{ background }}>
      {cover && (
        <Cover $size={size}>
          {image && (
            <img
              src={image.thumbnailUrl ?? image.url}
              alt=""
              loading="lazy"
              style={{ objectFit: coverFit ? "contain" : "cover" }}
            />
          )}
        </Cover>
      )}
      <CardBody>
        <CardHeading database={database} record={record} />
        <CardProperties
          database={database}
          record={record}
          fields={fields}
          showNames={showNames}
          readOnly={readOnly}
        />
        <SubItemCount database={database} record={record} />
        <CommentCount
          databaseId={database.id}
          recordId={record.id}
          documentId={record.documentId}
        />
      </CardBody>
    </Card>
  );
});

const columnWidth: Record<DatabaseCardSize, number> = {
  small: 180,
  medium: 260,
  large: 340,
};

const coverHeight: Record<DatabaseCardSize, number> = {
  small: 100,
  medium: 150,
  large: 200,
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0 16px;
`;

const Grid = styled.div<{ $size: DatabaseCardSize }>`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(${(props) => columnWidth[props.$size]}px, 1fr)
  );
  gap: 16px;
`;

const cardStyle = css`
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  ${borderRadius(8)}
  background: ${s("background")};
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "rgba(255, 255, 255, 0.094) 0 0 0 1px, rgba(0, 0, 0, 0.3) 0 2px 4px"
      : "rgba(15, 15, 15, 0.08) 0 0 0 1px, rgba(15, 15, 15, 0.06) 0 2px 4px"};
`;

const Card = styled.div`
  ${cardStyle}
  cursor: var(--pointer);
  transition: background 100ms ease;

  &:hover {
    background: ${s("backgroundSecondary")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: 2px;
  }
`;

const Cover = styled.div<{ $size: DatabaseCardSize }>`
  height: ${(props) => coverHeight[props.$size]}px;
  background: ${s("backgroundSecondary")};
  border-bottom: 1px solid ${s("divider")};

  img {
    display: block;
    width: 100%;
    height: 100%;
  }
`;

const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  min-width: 0;
`;

const NewCard = styled.button<{ $size: DatabaseCardSize }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: ${(props) => Math.max(coverHeight[props.$size] / 2, 64)}px;
  border: 1px dashed ${s("divider")};
  ${borderRadius(8)}
  background: none;
  color: ${s("textTertiary")};
  font-size: 14px;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
    outline: none;
  }
`;

const Placeholder = styled.div<{ $size: DatabaseCardSize }>`
  height: ${(props) => coverHeight[props.$size] + 80}px;
  ${borderRadius(8)}
  background: ${s("backgroundSecondary")};
  opacity: 0.6;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  max-width: 100%;
  padding: 2px 6px 2px 2px;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${s("text")};
  font-size: 14px;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    outline: none;
  }
`;

const Chevron = styled.span<{ $collapsed: boolean }>`
  display: inline-flex;
  color: ${s("textTertiary")};
  transform: rotate(${(props) => (props.$collapsed ? "-90deg" : "0deg")});
  transition: transform 120ms ease;
`;

const SectionValue = styled.span`
  min-width: 0;
  font-weight: 500;
`;

const SectionCount = styled.span`
  color: ${s("textTertiary")};
  font-size: 13px;
  opacity: 0;
  transition: opacity 100ms ease;

  ${SectionHeader}:hover &,
  ${SectionHeader}:focus-visible & {
    opacity: 1;
  }
`;

const Empty = styled.p`
  margin: 0;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

const LoadMore = styled.button`
  align-self: flex-start;
  padding: 4px 8px;
  border: 0;
  ${borderRadius(6)}
  background: none;
  color: ${s("textSecondary")};
  font-size: 14px;
  cursor: var(--pointer);

  &:hover:not(:disabled),
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    outline: none;
  }
`;

import { observer } from "mobx-react";
import { DocumentIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseField,
  DatabaseRecord,
} from "@shared/databases/types";
import { borderRadius, ellipsis, s } from "@shared/styles";
import type Database from "~/models/Database";
import { groupPrefill, groupRecords } from "../../toolbar/grouping";
import type { DatabaseViewProps } from "../../types";
import { GallerySection } from "../GalleryView";
import {
  CardProperties,
  openableProps,
  RecordTitle,
  visibleCardFields,
} from "../GalleryView/cards";
import { CommentCount } from "../../comments/CommentCount";
import { IconGlyph, useRowIcon } from "../../RowIcon";

/**
 * Notion-like list: one compact line per row, its page icon and title on the
 * left, the visible properties on the right; grouped in sections when the
 * view is grouped. Inline in a page, it shows the view's load limit of rows
 * before « Load more ».
 *
 * @param props the database, the view, its rows and the callbacks.
 * @returns the list.
 */
export const ListView = observer(function ListView({
  database,
  view,
  query,
  readOnly,
  onOpenRecord,
  onCreateRecord,
}: DatabaseViewProps) {
  const { t } = useTranslation();
  const fields = visibleCardFields(database, view);
  const groupLevel = view.group?.[0];
  const groupField = groupLevel
    ? database.fieldById(groupLevel.fieldId)
    : undefined;
  const canCreate = !readOnly && !!onCreateRecord;

  React.useEffect(() => {
    void query.fetch();
  }, [query]);

  const renderRows = (
    records: DatabaseRecord[],
    prefill?: Record<string, DatabaseCellInput>
  ) => (
    <Rows role="list">
      {records.map((record) => (
        <ListRow
          key={record.id}
          database={database}
          record={record}
          fields={fields}
          onOpen={onOpenRecord}
        />
      ))}
      {canCreate && (
        <NewRow type="button" onClick={() => void onCreateRecord?.(prefill)}>
          <PlusIcon size={18} />
          {t("New page")}
        </NewRow>
      )}
    </Rows>
  );

  return (
    <Wrapper aria-busy={query.isLoading}>
      {groupField
        ? groupRecords(query.records, groupField, groupLevel?.order).map(
            (group) => {
              const value = groupPrefill(groupField, group);
              return (
                <GallerySection
                  key={group.key}
                  database={database}
                  field={groupField}
                  group={group}
                >
                  {renderRows(
                    group.records,
                    value === undefined ? undefined : { [groupField.id]: value }
                  )}
                </GallerySection>
              );
            }
          )
        : renderRows(query.records)}
      {query.isLoaded && !query.records.length && !canCreate && (
        <Empty>{t("No pages to show")}</Empty>
      )}
      {query.hasMore && (
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

interface RowProps {
  database: Database;
  record: DatabaseRecord;
  fields: DatabaseField[];
  onOpen: (recordId: string) => void;
}

const ListRow = observer(function ListRow({
  database,
  record,
  fields,
  onOpen,
}: RowProps) {
  const icon = useRowIcon(database, record);

  return (
    <div role="listitem">
      <RowButton {...openableProps(() => onOpen(record.id))}>
        <PageIcon>
          {icon ? (
            <IconGlyph icon={icon} size={18} />
          ) : (
            <DocumentIcon size={18} />
          )}
        </PageIcon>
        <Title>
          <RecordTitle database={database} record={record} showIcon={false} />
        </Title>
        <Right>
          <CardProperties
            database={database}
            record={record}
            fields={fields}
            inline
          />
          <CommentCount
            databaseId={database.id}
            recordId={record.id}
            documentId={record.documentId}
          />
        </Right>
      </RowButton>
    </div>
  );
});

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0 16px;
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RowButton = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 2px 6px;
  ${borderRadius(4)}
  cursor: var(--pointer);

  &:hover {
    background: ${s("listItemHoverBackground")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: -2px;
  }
`;

const PageIcon = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  color: ${s("textTertiary")};
`;

const Title = styled.span`
  flex: 1 1 auto;
  min-width: 80px;
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
  ${ellipsis()}
`;

const Right = styled.span`
  display: flex;
  justify-content: flex-end;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
`;

const NewRow = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 2px 6px;
  border: 0;
  ${borderRadius(4)}
  background: none;
  color: ${s("textTertiary")};
  font-size: 14px;
  text-align: start;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
    outline: none;
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

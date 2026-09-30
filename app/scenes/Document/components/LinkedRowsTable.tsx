import { chunk } from "es-toolkit";
import { observer } from "mobx-react";
import { DocumentIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled, { css } from "styled-components";
import type { DatabaseField, DatabaseLinkValue } from "@shared/databases/types";
import { ellipsis, s } from "@shared/styles";
import {
  linkedRecordPath,
  linksOf,
} from "~/components/Database/cells/LinkCell";
import { getCell } from "~/components/Database/cells/registry";
import { FieldKindIcon } from "~/components/Database/fields/FieldKindIcon";
import type { RelationPageTab } from "~/components/Database/fields/pageTabs";
import { relationTabColumns } from "~/components/Database/fields/pageTabs";
import { recordTitle } from "~/components/Database/views/GalleryView/cards";
import { IconGlyph } from "~/components/Database/RowIcon";
import { linkIcon, rowIcon } from "~/components/Database/rowIcons";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";

interface Props {
  /** The database of the row. */
  databaseId: string;
  /** The row whose page shows the tab. */
  recordId: string;
  /** The relation tab. */
  tab: RelationPageTab;
}

/**
 * The rows a relation field of a row links to, like Notion's relation tabs: a compact read-only
 * table in the order of the relation, the linked row's title opening its page, then the columns
 * chosen by the tab.
 *
 * @param props the row and the tab.
 * @returns the table, a short empty state, or nothing while the row loads.
 */
export const LinkedRowsTable = observer(function LinkedRowsTable_({
  databaseId,
  recordId,
  tab,
}: Props) {
  const { t } = useTranslation();
  const { databases, databaseRecords } = useStores();
  const { field } = tab;
  const foreignDatabaseId = field.options.foreignDatabaseId;
  const record = databaseRecords.recordById(databaseId, recordId);
  const links = linksOf(record?.fields[field.id]);
  const linkedIds = links.map((link) => link.id).join(",");
  const linked = foreignDatabaseId
    ? databases.get(foreignDatabaseId)
    : undefined;
  const linkedDatabase = linked?.isSchemaLoaded ? linked : undefined;
  const fetched = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!databaseRecords.recordById(databaseId, recordId)) {
      void databaseRecords
        .fetchRecord(databaseId, recordId)
        .catch(() => undefined);
    }
  }, [databaseId, databaseRecords, recordId]);

  React.useEffect(() => {
    if (foreignDatabaseId) {
      void databases.fetch(foreignDatabaseId).catch(() => undefined);
    }
  }, [databases, foreignDatabaseId]);

  React.useEffect(() => {
    const missing = linkedIds
      .split(",")
      .filter((id) => id && !fetched.current.has(id));
    if (!foreignDatabaseId || !missing.length) {
      return;
    }
    let cancelled = false;
    void (async () => {
      // A few requests at a time: a relation can link to hundreds of rows.
      for (const ids of chunk(missing, 10)) {
        if (cancelled) {
          return;
        }
        await Promise.allSettled(
          ids.map((id) => databaseRecords.fetchRecord(foreignDatabaseId, id))
        );
        ids.forEach((id) => fetched.current.add(id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [databaseRecords, foreignDatabaseId, linkedIds]);

  if (!record) {
    return null;
  }
  if (!links.length) {
    return <Empty>{t("No linked pages")}</Empty>;
  }

  const primary = linkedDatabase?.primaryField;
  const columns = linkedDatabase
    ? relationTabColumns(
        linkedDatabase.fields,
        tab.visibleFieldIds,
        linkedDatabase.settings?.iconFieldId
      )
    : [];

  return (
    <Scroller>
      <Table>
        <thead>
          <tr>
            <Header scope="col">
              <HeaderLabel>
                {primary && <FieldKindIcon field={primary} size={16} />}
                {primary?.name ?? t("Name")}
              </HeaderLabel>
            </Header>
            {columns.map((column) => (
              <Header key={column.id} scope="col">
                <HeaderLabel>
                  <FieldKindIcon field={column} size={16} />
                  {column.name}
                </HeaderLabel>
              </Header>
            ))}
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <LinkedRow
              key={link.id}
              field={field}
              link={link}
              database={linkedDatabase}
              columns={columns}
            />
          ))}
        </tbody>
      </Table>
    </Scroller>
  );
});

interface RowProps {
  /** The relation field. */
  field: DatabaseField;
  /** The linked row, as the relation value holds it. */
  link: DatabaseLinkValue;
  /** The linked database, once its schema is loaded. */
  database?: Database;
  /** The columns after the title. */
  columns: DatabaseField[];
}

const LinkedRow = observer(function LinkedRow({
  field,
  link,
  database,
  columns,
}: RowProps) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const record = database
    ? databaseRecords.recordById(database.id, link.id)
    : undefined;
  const icon = database && record ? rowIcon(database, record) : linkIcon(link);
  const title =
    (database && record ? recordTitle(database, record) : "") || link.title;
  const path = linkedRecordPath(field, link.id);
  const content = (
    <>
      {icon ? <IconGlyph icon={icon} size={16} /> : <DocumentIcon size={16} />}
      {title ? (
        <TitleText>{title}</TitleText>
      ) : (
        <Untitled>{t("Untitled")}</Untitled>
      )}
    </>
  );

  return (
    <tr>
      <TitleCell>
        {path ? (
          <TitleLink to={path}>{content}</TitleLink>
        ) : (
          <TitlePlain>{content}</TitlePlain>
        )}
      </TitleCell>
      {columns.map((column) => {
        const { Renderer } = getCell(column.type);
        return (
          <Cell key={column.id}>
            {database && record && (
              <Renderer
                field={column}
                value={record.fields[column.id]}
                database={database}
                record={record}
                variant="table"
              />
            )}
          </Cell>
        );
      })}
    </tr>
  );
});

const Scroller = styled.div`
  overflow-x: auto;
  margin: 0 0 24px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: ${s("text")};

  th,
  td {
    border-bottom: 1px solid ${s("divider")};
  }

  th + th,
  td + td {
    border-left: 1px solid ${s("divider")};
  }
`;

const Header = styled.th`
  height: 34px;
  padding: 0 8px;
  border-top: 1px solid ${s("divider")};
  font-weight: normal;
  text-align: start;
  color: ${s("textSecondary")};
  white-space: nowrap;
`;

const HeaderLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }
`;

const Cell = styled.td`
  max-width: 280px;
  height: 34px;
  padding: 4px 8px;
  vertical-align: middle;
  overflow: hidden;
`;

const TitleCell = styled(Cell)`
  min-width: 200px;
  max-width: 360px;
`;

const titleStyle = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font-weight: 500;
  color: ${s("text")};

  svg {
    flex-shrink: 0;
    fill: ${s("textSecondary")};
  }
`;

const TitleLink = styled(Link)`
  ${titleStyle}
  text-decoration: underline;
  text-decoration-color: ${s("divider")};
  text-underline-offset: 2px;

  &:hover {
    text-decoration-color: ${s("textSecondary")};
  }
`;

const TitlePlain = styled.span`
  ${titleStyle}
`;

const TitleText = styled.span`
  min-width: 0;
  ${ellipsis()}
`;

const Untitled = styled.span`
  color: ${s("placeholder")};
`;

const Empty = styled.p`
  margin: 0 0 24px;
  font-size: 14px;
  color: ${s("textTertiary")};
`;

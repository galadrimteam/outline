import { observer } from "mobx-react";
import { ArrowIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseHistoryEntry,
} from "@shared/databases/types";
import { s } from "@shared/styles";
import { Avatar, AvatarSize } from "~/components/Avatar";
import Time from "~/components/Time";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { isEmptyCell } from "~/stores/DatabaseRecordsStore";
import { getCell } from "../cells/registry";

interface Props {
  /** The database of the row. */
  database: Database;
  /** The row. */
  recordId: string;
  /** Changes when the row is edited, to reload the history. */
  version?: string;
}

/**
 * The history of a row's properties, newest first, like Notion's page
 * history for properties: who changed which property, when, and the value
 * before and after, drawn with the cell renderers.
 *
 * @param props the database, the row and its version.
 * @returns the history.
 */
export const PropertyHistory = observer(function PropertyHistory_({
  database,
  recordId,
  version,
}: Props) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const [entries, setEntries] = React.useState<DatabaseHistoryEntry[]>([]);
  const [cursor, setCursor] = React.useState<string>();
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    databaseRecords
      .history(database.id, recordId)
      .then((page) => {
        if (!cancelled) {
          setEntries(page.entries);
          setCursor(page.nextCursor);
          setHasError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [databaseRecords, database.id, recordId, version]);

  const handleLoadMore = React.useCallback(async () => {
    if (!cursor) {
      return;
    }
    setIsLoading(true);
    try {
      const page = await databaseRecords.history(database.id, recordId, cursor);
      setEntries((current) => [...current, ...page.entries]);
      setCursor(page.nextCursor);
    } catch (_err) {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [databaseRecords, database.id, recordId, cursor]);

  if (hasError && !entries.length) {
    return (
      <Notice>{t("The history of the properties could not be loaded")}</Notice>
    );
  }
  if (!entries.length) {
    return (
      <Notice>
        {isLoading ? t("Loading") : t("No property has changed yet")}
      </Notice>
    );
  }

  return (
    <List aria-label={t("Property history")}>
      {entries.map((entry) => (
        <HistoryItem key={entry.id} database={database} entry={entry} />
      ))}
      {cursor && (
        <MoreButton
          type="button"
          disabled={isLoading}
          onClick={() => void handleLoadMore()}
        >
          {t("Show more")}
        </MoreButton>
      )}
    </List>
  );
});

const HistoryItem = observer(function HistoryItem({
  database,
  entry,
}: {
  database: Database;
  entry: DatabaseHistoryEntry;
}) {
  const { t } = useTranslation();
  const { users } = useStores();
  const author = entry.createdBy;
  const user = author?.outlineUserId
    ? users.get(author.outlineUserId)
    : undefined;
  const field = database.fieldById(entry.fieldId) ?? fieldOf(entry);

  return (
    <Item>
      <Meta>
        {user ? (
          <Avatar model={user} size={AvatarSize.Small} />
        ) : author?.avatarUrl ? (
          <Avatar src={author.avatarUrl} size={AvatarSize.Small} />
        ) : null}
        <Author>{user?.name ?? author?.title ?? t("Unknown")}</Author>
        <span>&middot;</span>
        <Time dateTime={entry.createdTime} addSuffix />
      </Meta>
      <Change>
        <FieldName title={field.name}>{field.name}</FieldName>
        <Value database={database} field={field} value={entry.before} />
        <Arrow aria-label={t("changed to")}>
          <ArrowIcon size={16} />
        </Arrow>
        <Value database={database} field={field} value={entry.after} />
      </Change>
    </Item>
  );
});

function Value({
  database,
  field,
  value,
}: {
  database: Database;
  field: DatabaseField;
  value: DatabaseCellValue;
}) {
  const { t } = useTranslation();
  if (isEmptyCell(value) || value === false) {
    return <Empty>{t("Empty")}</Empty>;
  }
  const { Renderer } = getCell(field.type);
  return (
    <ValueBox>
      <Renderer
        field={field}
        value={value}
        database={database}
        variant="card"
      />
    </ValueBox>
  );
}

/** A field deleted since the change, rebuilt from what the entry kept. */
function fieldOf(entry: DatabaseHistoryEntry): DatabaseField {
  const sample = entry.after ?? entry.before;
  return {
    id: entry.fieldId,
    name: entry.fieldName,
    type: entry.fieldType,
    options: {},
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: typeof sample === "number" ? "number" : "string",
    isMultipleCellValue: Array.isArray(sample),
  };
}

const List = styled.ol`
  list-style: none;
  margin: 8px 0 0;
  padding: 0 6px;
`;

const Item = styled.li`
  padding: 8px 0;

  & + & {
    border-top: 1px solid ${s("divider")};
  }
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${s("textTertiary")};
`;

const Author = styled.span`
  font-weight: 500;
  color: ${s("textSecondary")};
`;

const Change = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 14px;
`;

const FieldName = styled.span`
  min-width: 120px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${s("textSecondary")};
`;

const ValueBox = styled.span`
  display: inline-flex;
  align-items: center;
  max-width: 260px;
  min-width: 0;
  overflow: hidden;
`;

const Empty = styled.span`
  color: ${s("textTertiary")};
  font-style: italic;
`;

const Arrow = styled.span`
  display: inline-flex;
  color: ${s("textTertiary")};

  svg {
    fill: currentColor;
  }
`;

const Notice = styled.p`
  margin: 8px 6px 0;
  font-size: 14px;
  color: ${s("textTertiary")};
`;

const MoreButton = styled.button`
  margin-top: 4px;
  padding: 4px 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  color: ${s("textSecondary")};
  cursor: var(--pointer);

  &:hover {
    color: ${s("text")};
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

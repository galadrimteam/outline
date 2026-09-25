import { observer } from "mobx-react";
import {
  CollapsedIcon,
  DatabaseIcon,
  HistoryIcon,
  PlusIcon,
  SettingsIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseCellInput } from "@shared/databases/types";
import { s } from "@shared/styles";
import { AddFieldButton } from "~/components/Database/fields/AddFieldButton";
import { CustomizePageMenu } from "~/components/Database/fields/CustomizePageMenu";
import {
  pageFields,
  splitPageProperties,
} from "~/components/Database/fields/pageLayout";
import { PropertyRow } from "~/components/Database/fields/PropertyRow";
import { PropertyHistory } from "~/components/Database/history/PropertyHistory";
import useStores from "~/hooks/useStores";
import type Document from "~/models/Document";

interface Props {
  /** The page of a database row. */
  document: Document;
  /** Whether the reader may only look. */
  readOnly: boolean;
}

/**
 * The properties of a database row, under the title of its page, like Notion: one line per
 * property edited in place, "Add a property", the properties hidden by the page layout behind a
 * toggle, "Customize page", and a link back to the database. Values follow the database live.
 *
 * @param props the row page and whether it is read-only.
 * @returns the properties, or nothing while they load or when the database cannot be read.
 */
export const DatabaseProperties = observer(function DatabaseProperties_({
  document,
  readOnly,
}: Props) {
  const { t } = useTranslation();
  const { databases, databaseRecords } = useStores();
  const [showHidden, setShowHidden] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const databaseId = document.databaseId ?? "";
  const recordId = document.databaseRecordId ?? "";
  const database = databases.get(databaseId);
  const record = databaseRecords.recordById(databaseId, recordId);

  React.useEffect(() => {
    if (!databaseId || !recordId) {
      return;
    }
    void databases.fetch(databaseId).catch(() => undefined);
    void databaseRecords
      .fetchRecord(databaseId, recordId)
      .catch(() => undefined);
  }, [databaseId, databaseRecords, databases, recordId]);

  const handleChange = React.useCallback(
    (fieldId: string, value: DatabaseCellInput) => {
      databaseRecords
        .update(databaseId, recordId, { [fieldId]: value })
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : String(err))
        );
    },
    [databaseId, databaseRecords, recordId]
  );

  const handleChangeFields = React.useCallback(
    (values: Record<string, DatabaseCellInput>) => {
      databaseRecords
        .update(databaseId, recordId, values)
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : String(err))
        );
    },
    [databaseId, databaseRecords, recordId]
  );

  if (!database?.isSchemaLoaded || !record) {
    return null;
  }

  const layout = database.settings?.pageLayout;
  const fields = pageFields(
    database.fields,
    database.views,
    database.settings?.iconFieldId
  );
  const { shown, hidden } = splitPageProperties(fields, record, layout);
  const listed = showHidden ? [...shown, ...hidden] : shown;

  return (
    <Wrapper aria-label={t("Properties")}>
      <Back to={database.url || `/db/${database.id}`}>
        <DatabaseIcon size={16} />
        <span>{database.title || t("Untitled database")}</span>
      </Back>

      {listed.map((field) => (
        <PropertyRow
          key={field.id}
          database={database}
          field={field}
          record={record}
          readOnly={readOnly}
          onChange={handleChange}
          onChangeFields={handleChangeFields}
        />
      ))}

      <Actions>
        {hidden.length > 0 && (
          <Action
            type="button"
            onClick={() => setShowHidden((value) => !value)}
          >
            <Chevron $open={showHidden}>
              <CollapsedIcon size={18} />
            </Chevron>
            {showHidden
              ? t("Hide {{ count }} properties", { count: hidden.length })
              : t("{{ count }} more properties", { count: hidden.length })}
          </Action>
        )}
        {!readOnly && (
          <AddFieldButton database={database}>
            <Action type="button">
              <PlusIcon size={18} />
              {t("Add a property")}
            </Action>
          </AddFieldButton>
        )}
        {!readOnly && (
          <CustomizePageMenu database={database} fields={fields}>
            <Action type="button">
              <SettingsIcon size={18} />
              {t("Customize page")}
            </Action>
          </CustomizePageMenu>
        )}
        <Action
          type="button"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((value) => !value)}
        >
          <HistoryIcon size={18} />
          {t("Property history")}
        </Action>
      </Actions>

      {showHistory && (
        <PropertyHistory
          database={database}
          recordId={recordId}
          version={record.lastModifiedTime}
        />
      )}
    </Wrapper>
  );
});

const Wrapper = styled.section`
  margin: 4px 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${s("divider")};
`;

const Back = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px 6px;
  font-size: 13px;
  color: ${s("textTertiary")};

  svg {
    fill: currentColor;
  }

  &:hover {
    color: ${s("textSecondary")};
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 4px;
`;

const Action = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  font: inherit;
  font-size: 14px;
  color: ${s("textTertiary")};
  cursor: var(--pointer);

  svg {
    fill: currentColor;
  }

  &:hover,
  &[aria-expanded="true"] {
    color: ${s("textSecondary")};
    background: ${s("listItemHoverBackground")};
  }
`;

const Chevron = styled.span<{ $open: boolean }>`
  display: inline-flex;
  transform: rotate(${(props) => (props.$open ? "0deg" : "-90deg")});
  transition: transform 100ms ease;
`;

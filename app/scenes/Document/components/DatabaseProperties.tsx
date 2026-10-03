import { observer } from "mobx-react";
import {
  CollapsedIcon,
  CommentIcon,
  HistoryIcon,
  PlusIcon,
  SettingsIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css } from "styled-components";
import type { DatabaseCellInput, DatabaseField } from "@shared/databases/types";
import useShare from "@shared/hooks/useShare";
import { s } from "@shared/styles";
import { AddFieldButton } from "~/components/Database/fields/AddFieldButton";
import { CustomizePageMenu } from "~/components/Database/fields/CustomizePageMenu";
import {
  pageDiscussions,
  pageFields,
  splitPageProperties,
} from "~/components/Database/fields/pageLayout";
import { PropertyRow } from "~/components/Database/fields/PropertyRow";
import { PropertyHistory } from "~/components/Database/history/PropertyHistory";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import usePolicy from "~/hooks/usePolicy";
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
 * property edited in place, the properties hidden by the page layout behind « N more properties »
 * (or, with pinned properties, every other one behind « Show details »), then, on hover, "Add a
 * property", "Customize page", the history and, when the page discussions are minimal, "Add a
 * comment" (Notion's entry above the title). Nothing names the database above them, as in Notion:
 * the breadcrumb leads to it. Values follow the database live.
 *
 * @param props the row page and whether it is read-only.
 * @returns the properties, or nothing while they load or when the database cannot be read.
 */
export const DatabaseProperties = observer(function DatabaseProperties_({
  document,
  readOnly,
}: Props) {
  const { t } = useTranslation();
  const { databases, databaseRecords, ui } = useStores();
  const team = useCurrentTeam({ rejectOnEmpty: false });
  const { isShare } = useShare();
  const can = usePolicy(document);
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

  const handleAddComment = React.useCallback(
    () => ui.setPageCommentsRequest(document.id),
    [document.id, ui]
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
    database.settings?.iconFieldId,
    layout
  );
  const { shown, hidden, pinned } = splitPageProperties(fields, record, layout);
  const collapsed = hidden.length > 0 && !showHidden;
  const canAddComment =
    !!can.comment &&
    !!team?.commentingEnabled &&
    !isShare &&
    pageDiscussions(layout) === "minimal";

  const renderRow = (field: DatabaseField, stacked: boolean) => (
    <PropertyRow
      key={field.id}
      database={database}
      field={field}
      record={record}
      readOnly={readOnly}
      stacked={stacked}
      onChange={handleChange}
      onChangeFields={handleChangeFields}
    />
  );

  const toggle = hidden.length > 0 && (
    <Action
      type="button"
      aria-expanded={showHidden}
      onClick={() => setShowHidden((value) => !value)}
    >
      <Chevron $open={showHidden}>
        <CollapsedIcon size={18} />
      </Chevron>
      {pinned
        ? showHidden
          ? t("Hide details")
          : t("Show details")
        : showHidden
          ? t("Hide {{ count }} properties", { count: hidden.length })
          : t("{{ count }} more properties", { count: hidden.length })}
    </Action>
  );

  return (
    <Wrapper aria-label={t("Properties")}>
      {pinned && <Actions>{toggle}</Actions>}
      {shown.map((field) => renderRow(field, pinned))}
      {showHidden && hidden.map((field) => renderRow(field, false))}

      <Actions>
        {!pinned && toggle}
        {!readOnly && (
          <AddFieldButton database={database}>
            <Action type="button" $onHover={collapsed}>
              <PlusIcon size={18} />
              {t("Add a property")}
            </Action>
          </AddFieldButton>
        )}
        {!readOnly && (
          <CustomizePageMenu database={database} fields={fields}>
            <Action type="button" $onHover>
              <SettingsIcon size={18} />
              {t("Customize page")}
            </Action>
          </CustomizePageMenu>
        )}
        <Action
          type="button"
          aria-expanded={showHistory}
          $onHover={!showHistory}
          onClick={() => setShowHistory((value) => !value)}
        >
          <HistoryIcon size={18} />
          {t("Property history")}
        </Action>
        {canAddComment && (
          <Action type="button" $onHover onClick={handleAddComment}>
            <CommentIcon size={18} />
            {t("Add a comment")}
          </Action>
        )}
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
  margin: 4px 0 0;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 4px;
`;

/** A button of the panel; `$onHover` ones only show while the panel is hovered or focused. */
const Action = styled.button<{ $onHover?: boolean }>`
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

  ${(props) =>
    props.$onHover &&
    css`
      opacity: 0;
      transition: opacity 100ms ease;

      ${Wrapper}:hover &,
      ${Wrapper}:focus-within &,
      &[data-state="open"] {
        opacity: 1;
      }
    `}
`;

const Chevron = styled.span<{ $open: boolean }>`
  display: inline-flex;
  transform: rotate(${(props) => (props.$open ? "0deg" : "-90deg")});
  transition: transform 100ms ease;
`;

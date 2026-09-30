import { observer } from "mobx-react";
import { DocumentIcon, TableIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import type { RowPageTab } from "~/components/Database/fields/pageTabs";
import {
  focusedTabIndex,
  rowPageTabs,
} from "~/components/Database/fields/pageTabs";
import useStores from "~/hooks/useStores";
import type Document from "~/models/Document";
import { LinkedRowsTable } from "./LinkedRowsTable";

interface Props {
  /** The page; tabs only show on the page of a database row. */
  document?: Document;
  /** The body of the page, shown by the content tab. */
  children: React.ReactNode;
}

/**
 * The tabs of a database row page, like Notion's page layout: « Content » shows the body, a
 * relation tab the rows that relation links to. Without such tabs, only the body shows. The
 * body stays mounted while another tab is selected, so the editor keeps its state.
 *
 * @param props the page and its body.
 * @returns the tab bar, the selected tab and the body.
 */
export const RowPageTabs = observer(function RowPageTabs_({
  document,
  children,
}: Props) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const [selectedId, setSelectedId] = React.useState<string>();
  const baseId = React.useId();
  const databaseId = document?.databaseId ?? "";
  const recordId = document?.databaseRecordId ?? "";
  const database =
    databaseId && recordId ? databases.get(databaseId) : undefined;

  React.useEffect(() => {
    if (databaseId && recordId) {
      void databases.fetch(databaseId).catch(() => undefined);
    }
  }, [databaseId, databases, recordId]);

  const tabs = database?.isSchemaLoaded
    ? rowPageTabs(
        database.settings?.pageLayout?.tabs,
        database.fields,
        t("Content")
      )
    : [];
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
  const content = tabs.find((tab) => tab.kind === "content");
  const tabId = (tab: RowPageTab) => `${baseId}-tab-${tab.id}`;
  const panelId = (tab: RowPageTab) => `${baseId}-panel-${tab.id}`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === selected?.id);
    const target = focusedTabIndex(event.key, index, tabs.length);
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    const tab = tabs[target];
    setSelectedId(tab.id);
    window.document.getElementById(tabId(tab))?.focus();
  };

  return (
    <>
      {selected && (
        <TabList
          role="tablist"
          aria-label={t("Page tabs")}
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
            const isSelected = tab.id === selected.id;
            return (
              <Tab
                key={tab.id}
                id={tabId(tab)}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={panelId(tab)}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelectedId(tab.id)}
              >
                {tab.kind === "content" ? (
                  <DocumentIcon size={18} />
                ) : (
                  <TableIcon size={18} />
                )}
                <TabName>{tab.name}</TabName>
              </Tab>
            );
          })}
        </TabList>
      )}
      {selected?.kind === "relation" && (
        <div
          role="tabpanel"
          id={panelId(selected)}
          aria-labelledby={tabId(selected)}
        >
          <LinkedRowsTable
            key={selected.id}
            databaseId={databaseId}
            recordId={recordId}
            tab={selected}
          />
        </div>
      )}
      <Body
        role={content ? "tabpanel" : undefined}
        id={content ? panelId(content) : undefined}
        aria-labelledby={content ? tabId(content) : undefined}
        hidden={!!selected && selected.kind !== "content"}
      >
        {children}
      </Body>
    </>
  );
});

const TabList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 20px;
`;

const Tab = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  height: 32px;
  padding: 0 12px 0 10px;
  border: 0;
  border-radius: 16px;
  background: none;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: ${s("textTertiary")};
  cursor: var(--pointer);

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }

  &:hover,
  &[aria-selected="true"] {
    background: ${s("backgroundSecondary")};
  }

  &[aria-selected="true"] {
    color: ${s("text")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: -2px;
  }
`;

const TabName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** Lays the body out as if it were not wrapped. */
const Body = styled.div`
  display: contents;

  &[hidden] {
    display: none;
  }
`;

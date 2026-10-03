import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DatabaseLayout, DatabaseView } from "@shared/databases/types";
import { s } from "@shared/styles";
import { Popover, PopoverTrigger } from "~/components/primitives/Popover";
import {
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuPanel,
  MenuSeparator,
} from "./fields/components";
import { LayoutIcon } from "./LayoutIcon";
import { ViewIcon } from "./ViewIcon";

interface Props {
  /** Every view of the block, in tab order. */
  views: DatabaseView[];
  activeViewId: string | undefined;
  /** The layouts a new view can take, in the order offered. */
  layouts: DatabaseLayout[];
  /** The name of a layout. */
  layoutName: (layout: DatabaseLayout) => string;
  onSelect: (viewId: string) => void;
  /** Creates a view of a layout; absent for a reader. */
  onCreate?: (layout: DatabaseLayout) => void | Promise<void>;
  /** The button that opens the menu, « N more… ». */
  children: React.ReactElement;
}

/**
 * Notion's menu of the views that do not fit in the tabs: a search field, every view (the
 * active one marked), then « New view », which offers the layouts.
 *
 * @param props the views, the layouts a new one can take and the callbacks.
 * @returns the menu with its trigger.
 */
export const ViewsMenu = observer(function ViewsMenu_({
  views,
  activeViewId,
  layouts,
  layoutName,
  onSelect,
  onCreate,
  children,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [choosingLayout, setChoosingLayout] = React.useState(false);
  const matches = filterViews(views, query, t("Untitled"));

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setChoosingLayout(false);
    }
  }, []);

  const handleSelect = React.useCallback(
    (viewId: string) => {
      handleOpenChange(false);
      onSelect(viewId);
    },
    [handleOpenChange, onSelect]
  );

  const handleCreate = React.useCallback(
    (layout: DatabaseLayout) => {
      handleOpenChange(false);
      void onCreate?.(layout);
    },
    [handleOpenChange, onCreate]
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && matches.length) {
        event.preventDefault();
        handleSelect(matches[0].id);
      }
    },
    [handleSelect, matches]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>{children}</PopoverTrigger>
      <MenuPanel
        aria-label={t("More views")}
        side="bottom"
        align="start"
        width={290}
        shrink
      >
        {choosingLayout ? (
          layouts.map((layout) => (
            <MenuItem
              key={layout}
              type="button"
              onClick={() => handleCreate(layout)}
            >
              <LayoutIcon layout={layout} />
              <MenuLabel>{layoutName(layout)}</MenuLabel>
            </MenuItem>
          ))
        ) : (
          <>
            <MenuInput
              autoFocus
              value={query}
              placeholder={`${t("Search for a view")}…`}
              aria-label={t("Search for a view")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <List>
              {matches.map((view) => (
                <MenuItem
                  key={view.id}
                  type="button"
                  aria-current={view.id === activeViewId ? "true" : undefined}
                  onClick={() => handleSelect(view.id)}
                >
                  <ViewIcon view={view} size={18} />
                  <MenuLabel>{view.name || t("Untitled")}</MenuLabel>
                </MenuItem>
              ))}
              {!matches.length && <Empty>{t("No results")}</Empty>}
            </List>
            {onCreate && (
              <>
                <MenuSeparator />
                <MenuItem type="button" onClick={() => setChoosingLayout(true)}>
                  <PlusIcon size={18} />
                  <MenuLabel>{t("New view")}</MenuLabel>
                </MenuItem>
              </>
            )}
          </>
        )}
      </MenuPanel>
    </Popover>
  );
});

/**
 * The views whose name holds the query, case and accents aside.
 *
 * @param views the views, in order.
 * @param query what was typed.
 * @param untitled the name of a view without one.
 * @returns the matching views, in order.
 */
export function filterViews(
  views: DatabaseView[],
  query: string,
  untitled: string
): DatabaseView[] {
  const wanted = fold(query.trim());
  if (!wanted) {
    return views;
  }
  return views.filter((view) => fold(view.name || untitled).includes(wanted));
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const List = styled.div`
  max-height: 320px;
  overflow-y: auto;

  [aria-current="true"] {
    background: ${s("listItemHoverBackground")};
  }
`;

const Empty = styled.p`
  margin: 4px 12px;
  font-size: 14px;
  color: ${s("textTertiary")};
`;

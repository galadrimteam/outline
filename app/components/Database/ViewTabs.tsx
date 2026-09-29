import type { DragEndEvent } from "@dnd-kit/core";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import { DuplicateIcon, EditIcon, PlusIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css } from "styled-components";
import type { DatabaseView } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { s } from "@shared/styles";
import ConfirmationDialog from "~/components/ConfirmationDialog";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "~/components/primitives/Popover";
import { createAction } from "~/actions";
import { useMenuAction } from "~/hooks/useMenuAction";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { LayoutIcon } from "./LayoutIcon";
import { newViewSettings } from "./newViewDefaults";
import { PanelAction } from "./toolbar/components";
import { useTabStripMetrics } from "./useTabStripMetrics";
import { splitTabs } from "./viewTabsOverflow";

interface Props {
  database: Database;
  /** The views the block shows, in tab order. */
  views: DatabaseView[];
  activeViewId: string | undefined;
  readOnly: boolean;
  onSelect: (viewId: string) => void;
  /** Called with a view created from the block, eg to add it to a linked view. */
  onViewCreated?: (view: DatabaseView) => void;
  /** Controls shown at the right of the tabs: toolbar, search, « New ». */
  actions?: React.ReactNode;
}

/** The layouts offered for a new view, in Notion's order. */
export const creatableLayouts = [
  DatabaseLayout.Table,
  DatabaseLayout.Board,
  DatabaseLayout.Calendar,
  DatabaseLayout.Gallery,
  DatabaseLayout.List,
  DatabaseLayout.Timeline,
  DatabaseLayout.Form,
];

/**
 * The name of a layout.
 *
 * @param layout the layout.
 * @param t the translation function.
 * @returns the translated name.
 */
export function layoutName(
  layout: DatabaseLayout,
  t: (key: string) => string
): string {
  switch (layout) {
    case DatabaseLayout.Table:
      return t("Table");
    case DatabaseLayout.Board:
      return t("Board");
    case DatabaseLayout.Calendar:
      return t("Calendar");
    case DatabaseLayout.Gallery:
      return t("Gallery");
    case DatabaseLayout.List:
      return t("List");
    case DatabaseLayout.Timeline:
      return t("Timeline");
    default:
      return t("Form");
  }
}

/**
 * The view tabs of a database block: switch views, add one, and for editors
 * rename, duplicate, delete (click the active tab or right-click) and reorder
 * them by dragging.
 */
export const ViewTabs = observer(function ViewTabs({
  database,
  views,
  activeViewId,
  readOnly,
  onSelect,
  onViewCreated,
  actions,
}: Props) {
  const { t } = useTranslation();
  const { databases, dialogs } = useStores();
  const [menuViewId, setMenuViewId] = React.useState<string>();
  const [renamingViewId, setRenamingViewId] = React.useState<string>();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) {
        return;
      }
      const ids = views.map((view) => view.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1) {
        return;
      }
      databases
        .reorderView(
          database.id,
          String(active.id),
          String(over.id),
          from < to ? "after" : "before"
        )
        .catch(() => toast.error(t("Couldn’t move the view")));
    },
    [views, databases, database.id, t]
  );

  const handleCreate = React.useCallback(
    async (layout: DatabaseLayout) => {
      const { columnMeta, ...settings } = newViewSettings(
        layout,
        database.fields ?? []
      );
      try {
        const created = await databases.createView(database.id, {
          name: layoutName(layout, t),
          layout,
          ...settings,
        });
        const view = columnMeta
          ? await databases
              .updateView(database.id, created.id, { columnMeta })
              .catch(() => created)
          : created;
        onViewCreated?.(view);
        onSelect(view.id);
      } catch (_err) {
        toast.error(t("Couldn’t add the view"));
      }
    },
    [database, databases, onSelect, onViewCreated, t]
  );

  const addAction = useMenuAction(
    creatableLayouts.map((layout) =>
      createAction({
        name: layoutName(layout, t),
        section: "Database",
        icon: <LayoutIcon layout={layout} />,
        perform: () => handleCreate(layout),
      })
    )
  );

  const handleRename = React.useCallback(
    (view: DatabaseView, name: string) => {
      setRenamingViewId(undefined);
      const value = name.trim();
      if (!value || value === view.name) {
        return;
      }
      databases
        .updateView(database.id, view.id, { name: value })
        .catch(() => toast.error(t("Couldn’t rename the view")));
    },
    [databases, database.id, t]
  );

  const handleDuplicate = React.useCallback(
    async (view: DatabaseView) => {
      setMenuViewId(undefined);
      let copy: DatabaseView;
      try {
        copy = await databases.duplicateView(database.id, view.id);
      } catch (_err) {
        toast.error(t("Couldn’t duplicate the view"));
        return;
      }
      // The engines add the copy last; Notion puts it next to its source.
      const moved = databases.reorderView(
        database.id,
        copy.id,
        view.id,
        "after"
      );
      onViewCreated?.(copy);
      onSelect(copy.id);
      await moved.catch(() => toast.error(t("Couldn’t move the view")));
    },
    [databases, database.id, onSelect, onViewCreated, t]
  );

  const handleDelete = React.useCallback(
    (view: DatabaseView) => {
      setMenuViewId(undefined);
      dialogs.openModal({
        title: t("Delete view?"),
        content: (
          <ConfirmationDialog
            danger
            submitText={t("Delete")}
            onSubmit={async () => {
              try {
                await databases.deleteView(database.id, view.id);
              } catch (_err) {
                toast.error(t("Couldn’t delete the view"));
              }
            }}
          >
            {t(
              "The view “{{ name }}” will be deleted for everyone. Its rows stay in the database.",
              { name: view.name || t("Untitled") }
            )}
          </ConfirmationDialog>
        ),
      });
    },
    [databases, database.id, dialogs, t]
  );

  const { stripRef, measureRef, metrics } = useTabStripMetrics({
    gap: TAB_GAP,
    addWidth: readOnly ? 0 : ADD_WIDTH,
  });
  const activeIndex = views.findIndex((view) => view.id === activeViewId);
  const split =
    metrics && metrics.widths.length === views.length
      ? splitTabs(metrics, activeIndex)
      : undefined;
  const shownViews = split ? split.visible.map((index) => views[index]) : views;
  const hiddenViews = split ? split.hidden.map((index) => views[index]) : [];

  const moreAction = useMenuAction(
    hiddenViews.map((view) =>
      createAction({
        id: `view-${view.id}`,
        name: view.name || t("Untitled"),
        section: "Database",
        icon: <LayoutIcon layout={view.layout} />,
        perform: () => onSelect(view.id),
      })
    )
  );

  return (
    <Bar>
      <Strip ref={stripRef}>
        <Measure ref={measureRef} aria-hidden>
          {views.map((view) => (
            <Tab key={view.id} as="span" $isActive={false}>
              <TabFace view={view} />
            </Tab>
          ))}
          <MoreButton as="span">
            {t("{{ count }} more", { count: views.length })}
          </MoreButton>
        </Measure>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={handleDragEnd}
        >
          <Tabs role="tablist" aria-label={t("Views")}>
            <SortableContext
              items={shownViews.map((view) => view.id)}
              strategy={horizontalListSortingStrategy}
            >
              {shownViews.map((view) => (
                <ViewTab
                  key={view.id}
                  view={view}
                  isActive={view.id === activeViewId}
                  readOnly={readOnly}
                  isMenuOpen={menuViewId === view.id}
                  isRenaming={renamingViewId === view.id}
                  canDelete={views.length > 1}
                  onSelect={onSelect}
                  onOpenMenu={setMenuViewId}
                  onStartRename={setRenamingViewId}
                  onRename={handleRename}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>
          </Tabs>
        </DndContext>
        {hiddenViews.length > 0 && (
          <DropdownMenu action={moreAction} ariaLabel={t("More views")}>
            <MoreButton type="button">
              {t("{{ count }} more", { count: hiddenViews.length })}
            </MoreButton>
          </DropdownMenu>
        )}
        {!readOnly && (
          <DropdownMenu action={addAction} ariaLabel={t("Add a view")}>
            <AddButton aria-label={t("Add a view")}>
              <PlusIcon size={18} />
            </AddButton>
          </DropdownMenu>
        )}
      </Strip>
      {actions && <Actions>{actions}</Actions>}
    </Bar>
  );
});

function TabFace({ view }: { view: DatabaseView }) {
  const { t } = useTranslation();
  return (
    <>
      <LayoutIcon layout={view.layout} size={18} />
      <TabLabel>{view.name || t("Untitled")}</TabLabel>
    </>
  );
}

interface ViewTabProps {
  view: DatabaseView;
  isActive: boolean;
  readOnly: boolean;
  isMenuOpen: boolean;
  isRenaming: boolean;
  canDelete: boolean;
  onSelect: (viewId: string) => void;
  onOpenMenu: (viewId: string | undefined) => void;
  onStartRename: (viewId: string | undefined) => void;
  onRename: (view: DatabaseView, name: string) => void;
  onDuplicate: (view: DatabaseView) => void;
  onDelete: (view: DatabaseView) => void;
}

const ViewTab = observer(function ViewTab({
  view,
  isActive,
  readOnly,
  isMenuOpen,
  isRenaming,
  canDelete,
  onSelect,
  onOpenMenu,
  onStartRename,
  onRename,
  onDuplicate,
  onDelete,
}: ViewTabProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id, disabled: readOnly || isRenaming });

  const handleClick = React.useCallback(() => {
    if (!isActive) {
      onSelect(view.id);
      return;
    }
    if (!readOnly) {
      onOpenMenu(view.id);
    }
  }, [isActive, readOnly, onSelect, onOpenMenu, view.id]);

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent) => {
      if (readOnly) {
        return;
      }
      event.preventDefault();
      onOpenMenu(view.id);
    },
    [readOnly, onOpenMenu, view.id]
  );

  const handleDoubleClick = React.useCallback(() => {
    if (!readOnly) {
      onStartRename(view.id);
    }
  }, [readOnly, onStartRename, view.id]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => onOpenMenu(open ? view.id : undefined),
    [onOpenMenu, view.id]
  );

  const handleRenameClick = React.useCallback(() => {
    onOpenMenu(undefined);
    onStartRename(view.id);
  }, [onOpenMenu, onStartRename, view.id]);

  return (
    <Popover open={isMenuOpen} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <TabWrapper
          ref={setNodeRef}
          style={{ transform: CSS.Translate.toString(transform), transition }}
          $isDragging={isDragging}
        >
          {isRenaming ? (
            <RenameInput view={view} onDone={onRename} />
          ) : (
            <Tab
              {...attributes}
              {...listeners}
              type="button"
              role="tab"
              aria-selected={isActive}
              $isActive={isActive}
              onClick={handleClick}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleDoubleClick}
            >
              <TabFace view={view} />
            </Tab>
          )}
        </TabWrapper>
      </PopoverAnchor>
      <PopoverContent
        width={220}
        align="start"
        shrink
        aria-label={t("View options")}
      >
        <MenuList>
          <PanelAction type="button" onClick={handleRenameClick}>
            <EditIcon size={18} />
            {t("Rename")}
          </PanelAction>
          <PanelAction type="button" onClick={() => onDuplicate(view)}>
            <DuplicateIcon size={18} />
            {t("Duplicate")}
          </PanelAction>
          {canDelete && (
            <PanelAction type="button" $danger onClick={() => onDelete(view)}>
              <TrashIcon size={18} />
              {t("Delete view")}
            </PanelAction>
          )}
        </MenuList>
      </PopoverContent>
    </Popover>
  );
});

function RenameInput({
  view,
  onDone,
}: {
  view: DatabaseView;
  onDone: (view: DatabaseView, name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = React.useState(view.name);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        onDone(view, name);
      } else if (event.key === "Escape") {
        event.preventDefault();
        onDone(view, view.name);
      }
    },
    [onDone, view, name]
  );

  return (
    <Rename
      autoFocus
      value={name}
      size={Math.max(name.length, 4)}
      aria-label={t("View name")}
      onChange={(event) => setName(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onDone(view, name)}
      onFocus={(event) => event.target.select()}
    />
  );
}

const TAB_GAP = 2;
const ADD_WIDTH = 28;

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border-bottom: 1px solid ${s("divider")};
`;

const Strip = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: ${TAB_GAP}px;
  flex: 1 1 auto;
  min-width: 0;
`;

const Measure = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  gap: ${TAB_GAP}px;
  width: max-content;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;

  > * {
    flex-shrink: 0;
  }
`;

// Clips rather than scrolls: the tabs that do not fit are listed under « N more ».
const Tabs = styled.div`
  display: flex;
  align-items: center;
  gap: ${TAB_GAP}px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
`;

const TabWrapper = styled.div<{ $isDragging: boolean }>`
  position: relative;
  flex-shrink: 0;
  ${(props) =>
    props.$isDragging &&
    css`
      z-index: 1;
      opacity: 0.6;
    `}
`;

const Tab = styled.button<{ $isActive: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 8px;
  border: 0;
  background: none;
  color: ${(props) =>
    props.$isActive ? props.theme.text : props.theme.textTertiary};
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: var(--pointer);
  user-select: none;

  &::before {
    content: "";
    position: absolute;
    inset: 4px 0;
    border-radius: 6px;
    transition: background 100ms ease-in-out;
  }

  &:hover::before {
    background: ${s("listItemHoverBackground")};
  }

  &::after {
    content: "";
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: -1px;
    height: 2px;
    border-radius: 1px;
    background: ${(props) => (props.$isActive ? props.theme.text : "transparent")};
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: -4px;
    border-radius: 6px;
  }

  svg,
  span {
    position: relative;
  }
`;

const TabLabel = styled.span`
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Rename = styled.input`
  height: 28px;
  margin: 4px 0;
  padding: 0 6px;
  border: 1px solid ${s("inputBorderFocused")};
  border-radius: 6px;
  background: ${s("background")};
  color: ${s("text")};
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  outline: none;
`;

const MoreButton = styled.button`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textTertiary")};
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: var(--pointer);

  &:hover,
  &[data-state="open"] {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const AddButton = styled.button`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: ${ADD_WIDTH}px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textTertiary")};
  cursor: var(--pointer);

  &:hover,
  &[data-state="open"] {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 4px 0;
`;

const MenuList = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 6px;
`;

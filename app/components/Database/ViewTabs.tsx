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
import { hideScrollbars, s } from "@shared/styles";
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
import { isStackable } from "./boardModel";
import { LayoutIcon } from "./LayoutIcon";
import { PanelAction } from "./toolbar/components";

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
  const { databases } = useStores();
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
      const stackField = (database.fields ?? []).find(isStackable);
      try {
        const view = await databases.createView(database.id, {
          name: layoutName(layout, t),
          layout,
          options:
            layout === DatabaseLayout.Board && stackField
              ? { stackFieldId: stackField.id }
              : undefined,
        });
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
      try {
        const copy = await databases.duplicateView(database.id, view.id);
        onViewCreated?.(copy);
        onSelect(copy.id);
      } catch (_err) {
        toast.error(t("Couldn’t duplicate the view"));
      }
    },
    [databases, database.id, onSelect, onViewCreated, t]
  );

  const handleDelete = React.useCallback(
    (view: DatabaseView) => {
      setMenuViewId(undefined);
      databases
        .deleteView(database.id, view.id)
        .catch(() => toast.error(t("Couldn’t delete the view")));
    },
    [databases, database.id, t]
  );

  return (
    <Bar>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <Tabs role="tablist" aria-label={t("Views")}>
          <SortableContext
            items={views.map((view) => view.id)}
            strategy={horizontalListSortingStrategy}
          >
            {views.map((view) => (
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
          {!readOnly && (
            <DropdownMenu action={addAction} ariaLabel={t("Add a view")}>
              <AddButton aria-label={t("Add a view")}>
                <PlusIcon size={18} />
              </AddButton>
            </DropdownMenu>
          )}
        </Tabs>
      </DndContext>
      {actions && <Actions>{actions}</Actions>}
    </Bar>
  );
});

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
              <LayoutIcon layout={view.layout} size={18} />
              <TabLabel>{view.name || t("Untitled")}</TabLabel>
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

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border-bottom: 1px solid ${s("divider")};
`;

const Tabs = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  ${hideScrollbars()}
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

const AddButton = styled.button`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
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

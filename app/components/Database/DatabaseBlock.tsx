import { observer } from "mobx-react";
import copy from "copy-to-clipboard";
import {
  AlignFullWidthIcon,
  CloseIcon,
  EyeIcon,
  HiddenIcon,
  LightningIcon,
  LinkIcon,
  SearchIcon,
  TrashIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { toast } from "sonner";
import styled, { css } from "styled-components";
import type {
  DatabaseCellInput,
  DatabaseRecordOrder,
  DatabaseView,
} from "@shared/databases/types";
import { appendFilterNode, createFilterItem } from "@shared/databases/filters";
import { DatabaseLayout } from "@shared/databases/types";
import type { DatabaseAttrs } from "@shared/editor/nodes/Database";
import { databaseAttrs } from "@shared/editor/nodes/Database";
import type { ComponentProps } from "@shared/editor/types";
import { s } from "@shared/styles";
import {
  DropdownMenu,
  NonModalMenusContext,
} from "~/components/Menu/DropdownMenu";
import { useSplitView } from "~/components/SplitView/context";
import Tooltip from "~/components/Tooltip";
import { createAction } from "~/actions";
import { useEditor } from "~/editor/components/EditorContext";
import { useMenuAction } from "~/hooks/useMenuAction";
import useMobile from "~/hooks/useMobile";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { AuthorizationError, NotFoundError } from "~/utils/errors";
import lazyWithRetry from "~/utils/lazyWithRetry";
import { databasePath } from "~/utils/routeHelpers";
import type { SplitViewPane } from "~/utils/splitView";
import { blockChrome } from "./blockChrome";
import { boardColumns, isStackable, stackValue } from "./boardModel";
import { openRowPeek } from "./rowPeek";
import type { FilterRequest } from "./DatabaseBlockContext";
import { DatabaseBlockContext } from "./DatabaseBlockContext";
import { DatabaseHeader } from "./DatabaseHeader";
import { DatabasePicker } from "./DatabasePicker";
import { viewPageSize } from "./loadLimit";
import { pendingDatabases } from "./pendingDatabases";
import { NewRecordMenu } from "./templates/NewRecordMenu";
import { openDatabaseAutomations } from "./automations/openDatabaseAutomations";
import { useDatabaseShare } from "./useDatabaseShare";
import { FormSharing } from "~/scenes/DatabaseForm/FormSharing";
import { DatabaseToolbar } from "./toolbar/DatabaseToolbar";
import { DragHandleIcon } from "./toolbar/icons";
import { OpenFullPageButton } from "./toolbar/OpenFullPageButton";
import {
  canSaveView,
  draftFilter,
  viewDrafts,
  viewQueryParams,
} from "./toolbar/viewDrafts";
import type { TableViewProps } from "./views/TableView";
import { subItemsOf, topLevelFilter } from "./views/TableView/subItems";
import { useActiveView } from "./useActiveView";
import { useDatabaseTitleSync } from "./useDatabaseTitleSync";
import { BLEED_VARIABLE } from "./views/bleed";
import { useRightBleed } from "./useRightBleed";
import { ViewTabs } from "./ViewTabs";

const BoardView = lazyWithRetry(() =>
  import("./views/BoardView").then((module) => ({ default: module.BoardView }))
);
const TableView = lazyWithRetry(() =>
  import("./views/TableView").then((module) => ({ default: module.TableView }))
);
const CalendarView = lazyWithRetry(() =>
  import("./views/CalendarView").then((module) => ({
    default: module.CalendarView,
  }))
);
const GalleryView = lazyWithRetry(() =>
  import("./views/GalleryView").then((module) => ({
    default: module.GalleryView,
  }))
);
const ListView = lazyWithRetry(() =>
  import("./views/ListView").then((module) => ({ default: module.ListView }))
);
const TimelineView = lazyWithRetry(() =>
  import("./views/TimelineView").then((module) => ({
    default: module.TimelineView,
  }))
);

/**
 * The editor view of a `database` node: a database drawn in a document, with
 * its title, view tabs, toolbar and the active view. A block without a
 * database yet is being created, or asks which database to show.
 */
export const DatabaseBlock = observer(function DatabaseBlock(
  props: ComponentProps
) {
  const attrs = databaseAttrs(props.node);
  const actions = useNodeActions(props);

  return (
    <NonModalMenusContext.Provider value>
      {attrs.databaseId ? (
        <DatabaseFrame
          databaseId={attrs.databaseId}
          blockKey={attrs.id ?? attrs.databaseId}
          viewIds={attrs.viewIds}
          fullPage={attrs.fullPage}
          hideTitle={attrs.hideTitle}
          title={attrs.title}
          isEditable={props.isEditable}
          isSelected={props.isSelected}
          isInPageFlow={isInPageFlow(props)}
          actions={actions}
        />
      ) : (
        <EmptyBlock
          attrs={attrs}
          isEditable={props.isEditable}
          updateAttrs={actions.updateAttrs}
        />
      )}
    </NonModalMenusContext.Provider>
  );
});

type UpdateAttrs = (patch: Partial<DatabaseAttrs>) => void;

/** The blocks that leave a database in the flow of the page's text. */
const FLOW_CONTAINERS = new Set(["container_toggle"]);

/**
 * Whether the block sits in the flow of the page's text, possibly in a
 * toggle, rather than in a box such as a callout: only then may it run right
 * of the text, as Notion's wide databases do.
 */
function isInPageFlow({ view, getPos }: ComponentProps): boolean {
  try {
    const $pos = view.state.doc.resolve(getPos());
    for (let depth = $pos.depth; depth > 0; depth--) {
      if (!FLOW_CONTAINERS.has($pos.node(depth).type.name)) {
        return false;
      }
    }
    return true;
  } catch (_err) {
    return false;
  }
}

interface NodeActions {
  /** Writes attributes of the block's node. */
  updateAttrs: UpdateAttrs;
  /** Removes the block from the document; the database itself stays. */
  remove: () => void;
}

/** Edits the block's node, when the document is editable. */
function useNodeActions({ view, getPos }: ComponentProps): NodeActions {
  const locate = React.useCallback(() => {
    if (!view.editable) {
      return undefined;
    }
    try {
      const pos = getPos();
      const node = view.state.doc.nodeAt(pos);
      return node?.type.name === "database" ? { pos, node } : undefined;
    } catch (_err) {
      return undefined;
    }
  }, [view, getPos]);

  const updateAttrs = React.useCallback(
    (patch: Partial<DatabaseAttrs>) => {
      const found = locate();
      if (found) {
        view.dispatch(
          view.state.tr.setNodeMarkup(found.pos, undefined, {
            ...found.node.attrs,
            ...patch,
          })
        );
      }
    },
    [view, locate]
  );

  const remove = React.useCallback(() => {
    const found = locate();
    if (found) {
      view.dispatch(
        view.state.tr.delete(found.pos, found.pos + found.node.nodeSize)
      );
    }
  }, [view, locate]);

  return React.useMemo(() => ({ updateAttrs, remove }), [updateAttrs, remove]);
}

const EmptyBlock = observer(function EmptyBlock({
  attrs,
  isEditable,
  updateAttrs,
}: {
  attrs: DatabaseAttrs;
  isEditable: boolean;
  updateAttrs: UpdateAttrs;
}) {
  const { t } = useTranslation();
  const { databases, documents } = useStores();
  const editor = useEditor();
  const makeHostFullWidth = useFullWidthHost();
  const pending = attrs.id ? pendingDatabases.get(attrs.id) : undefined;
  const [error, setError] = React.useState<string>();
  const [isCreating, setIsCreating] = React.useState(
    pending?.kind === "create"
  );

  const create = React.useCallback(
    (layout: DatabaseLayout) => {
      const documentId = editor.props.id;
      const document = documentId ? documents.get(documentId) : undefined;
      if (!document?.collectionId) {
        setError(
          t("Databases can only be added to documents in a collection.")
        );
        setIsCreating(false);
        return;
      }

      const key = attrs.id ?? "";
      const entry = pendingDatabases.get(key);
      const request =
        entry?.kind === "create" && entry.request
          ? entry.request
          : databases
              .create({
                collectionId: document.collectionId,
                documentId: document.id,
                title: (attrs.fullPage && document.title.trim()) || undefined,
                layout,
              })
              .then((database) => database.id);
      pendingDatabases.set(key, { kind: "create", layout, request });
      setIsCreating(true);

      request
        .then((databaseId) => {
          pendingDatabases.delete(key);
          if (attrs.fullPage) {
            makeHostFullWidth();
          }
          updateAttrs({
            databaseId,
            title: databases.get(databaseId)?.title ?? null,
          });
        })
        .catch(() => {
          pendingDatabases.delete(key);
          setIsCreating(false);
          setError(t("Couldn’t create the database, try again?"));
        });
    },
    [
      attrs.id,
      attrs.fullPage,
      databases,
      documents,
      editor,
      makeHostFullWidth,
      updateAttrs,
      t,
    ]
  );

  React.useEffect(() => {
    if (pending?.kind === "create") {
      create(pending.layout);
    }
    // Only the creation requested by the block menu starts on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = React.useCallback(
    (database: Database) => {
      if (attrs.id) {
        pendingDatabases.delete(attrs.id);
      }
      updateAttrs({ databaseId: database.id, title: database.title });
    },
    [attrs.id, updateAttrs]
  );

  const handleCreate = React.useCallback(
    () => create(DatabaseLayout.Table),
    [create]
  );

  if (isCreating) {
    return (
      <Frame $fullPage={attrs.fullPage} aria-busy>
        <Skeleton label={t("Creating the database…")} />
      </Frame>
    );
  }

  if (!isEditable) {
    return (
      <Frame $fullPage={attrs.fullPage} $boxed>
        <Notice>{t("This block does not show any database yet.")}</Notice>
      </Frame>
    );
  }

  return (
    <Frame $fullPage={attrs.fullPage} $boxed>
      {error && <Notice role="alert">{error}</Notice>}
      <DatabasePicker
        autoFocus={pending?.kind === "link"}
        onSelect={handleSelect}
        onCreate={handleCreate}
      />
    </Frame>
  );
});

interface FrameProps {
  databaseId: string;
  blockKey: string;
  viewIds: string[] | null;
  fullPage: boolean;
  hideTitle: boolean;
  /** The `title` attribute of the node. */
  title: string | null;
  isEditable: boolean;
  isSelected: boolean;
  /** Whether the block may run right of the text column (see `isInPageFlow`). */
  isInPageFlow: boolean;
  actions: NodeActions;
}

/**
 * Returns a function that makes the page holding the block full width: a
 * full-page database is drawn edge to edge, as in Notion.
 *
 * @returns the function.
 */
function useFullWidthHost() {
  const editor = useEditor();
  const { documents } = useStores();
  return React.useCallback(() => {
    const document = editor.props.id
      ? documents.get(editor.props.id)
      : undefined;
    if (document && !document.fullWidth) {
      document.fullWidth = true;
      void document.save({ fullWidth: true });
    }
  }, [editor, documents]);
}

const DatabaseFrame = observer(function DatabaseFrame({
  databaseId,
  blockKey,
  viewIds,
  fullPage,
  hideTitle,
  title,
  isEditable,
  isSelected,
  isInPageFlow,
  actions,
}: FrameProps) {
  const { updateAttrs } = actions;
  const editor = useEditor();
  const [frame, setFrame] = React.useState<HTMLDivElement | null>(null);
  const bleed = useRightBleed(frame, isInPageFlow);
  const { t } = useTranslation();
  const { databases, policies } = useStores();
  const share = useDatabaseShare();
  const [loadError, setLoadError] = React.useState<Error>();
  const database = databases.get(databaseId);
  const isLoaded = !!database?.isSchemaLoaded;
  const readOnly =
    share.readOnly || !isEditable || !policies.abilities(databaseId).update;

  const setNodeTitle = React.useCallback(
    (next: string | null) => updateAttrs({ title: next }),
    [updateAttrs]
  );
  useDatabaseTitleSync({
    database: isLoaded ? database : undefined,
    fullPage,
    nodeTitle: title,
    canRename: !readOnly,
    setNodeTitle,
  });

  const load = React.useCallback(() => {
    setLoadError(undefined);
    databases.fetch(databaseId).catch((err: Error) => setLoadError(err));
  }, [databases, databaseId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const { views, activeView, setActiveViewId } = useActiveView(
    isLoaded ? database : undefined,
    blockKey,
    viewIds
  );

  const handleViewCreated = React.useCallback(
    (view: DatabaseView) => {
      if (viewIds?.length && !viewIds.includes(view.id)) {
        updateAttrs({ viewIds: [...viewIds, view.id] });
      }
      setActiveViewId(view.id);
    },
    [viewIds, updateAttrs, setActiveViewId]
  );

  if (!database || !isLoaded) {
    if (loadError) {
      return (
        <Frame $fullPage={fullPage} $selected={isSelected} $boxed>
          <BlockOptions
            databaseId={databaseId}
            fullPage={fullPage}
            hideTitle={hideTitle}
            isEditable={isEditable}
            actions={actions}
            floating
          />
          <Notice role="alert">
            {loadError instanceof AuthorizationError
              ? t("You don’t have access to this database.")
              : loadError instanceof NotFoundError
                ? t("This database was deleted or does not exist.")
                : t("Couldn’t load the database.")}
            {!(loadError instanceof AuthorizationError) &&
              !(loadError instanceof NotFoundError) && (
                <NoticeButton type="button" onClick={load}>
                  {t("Retry")}
                </NoticeButton>
              )}
          </Notice>
        </Frame>
      );
    }
    return (
      <Frame $fullPage={fullPage} $selected={isSelected} aria-busy>
        <Skeleton label={t("Loading the database…")} />
      </Frame>
    );
  }

  const chrome = blockChrome({ fullPage, hideTitle, viewCount: views.length });
  const heading = chrome.showHeading ? (
    <DatabaseHeader database={database} readOnly={readOnly} fullPage={false} />
  ) : null;
  const options = (
    <BlockOptions
      databaseId={database.id}
      fullPage={fullPage}
      hideTitle={hideTitle}
      isEditable={isEditable}
      actions={actions}
    />
  );
  return (
    <Frame
      ref={setFrame}
      $fullPage={fullPage}
      $selected={isSelected}
      style={{ [BLEED_VARIABLE]: `${bleed}px` } as React.CSSProperties}
    >
      {activeView ? (
        <LoadedView
          database={database}
          view={activeView}
          views={views}
          readOnly={readOnly}
          fullPage={fullPage}
          heading={heading}
          headingAbove={chrome.headingAbove}
          options={options}
          documentId={editor.props.id}
          onSelectView={setActiveViewId}
          onViewCreated={handleViewCreated}
        />
      ) : (
        <>
          <ViewTabs
            database={database}
            views={views}
            activeViewId={undefined}
            readOnly={readOnly}
            onSelect={setActiveViewId}
            onViewCreated={handleViewCreated}
            lead={heading}
            actions={options}
          />
          <Notice>{t("This database has no view yet.")}</Notice>
        </>
      )}
    </Frame>
  );
});

interface LoadedViewProps {
  database: Database;
  view: DatabaseView;
  views: DatabaseView[];
  readOnly: boolean;
  fullPage: boolean;
  /** The database name, when the block shows it. */
  heading: React.ReactNode;
  /** Whether the name has a row of its own above the tabs. */
  headingAbove: boolean;
  /** The block's own menu. */
  options: React.ReactNode;
  /** The document the block is drawn in. */
  documentId: string | undefined;
  onSelectView: (viewId: string) => void;
  onViewCreated: (view: DatabaseView) => void;
}

const LoadedView = observer(function LoadedView({
  database,
  view,
  views,
  readOnly,
  fullPage,
  heading,
  headingAbove,
  options,
  documentId,
  onSelectView,
  onViewCreated,
}: LoadedViewProps) {
  const share = useDatabaseShare();
  const { t } = useTranslation();
  const { databaseRecords, ui } = useStores();
  const history = useHistory();
  const { pane } = useSplitView();
  const isMobile = useMobile();
  const [search, setSearch] = React.useState("");

  const subItems = subItemsOf(database, view);
  const query = databaseRecords.query(database.id, view.id, {
    ...viewQueryParams(database, view, readOnly),
    search: search || undefined,
    extraFilter:
      subItems?.mode === "nested" ? topLevelFilter(subItems) : undefined,
    pageSize: viewPageSize(view, fullPage),
  });

  React.useEffect(() => {
    if (view.layout !== DatabaseLayout.Board) {
      void query.fetch();
    }
  }, [query, view.layout]);

  const openRecordPage = React.useCallback(
    async (recordId: string): Promise<SplitViewPane | undefined> => {
      try {
        const document = await databaseRecords.open(database.id, recordId);
        const path = share.rowPath(document.path);
        if (
          !share.canOpenInSplit ||
          view.overrides.openPagesIn === "fullPage" ||
          pane === "secondary" ||
          isMobile
        ) {
          history.push(path);
          return pane;
        }
        openRowPeek(ui, path);
        return "secondary";
      } catch (_err) {
        toast.error(t("Couldn’t open the page"));
        return undefined;
      }
    },
    [
      databaseRecords,
      database.id,
      view.overrides.openPagesIn,
      pane,
      isMobile,
      history,
      share,
      t,
      ui,
    ]
  );

  const handleOpenRecord = React.useCallback(
    async (recordId: string) => {
      await openRecordPage(recordId);
    },
    [openRecordPage]
  );

  const handleOpen = React.useCallback(
    (recordId: string) => void handleOpenRecord(recordId),
    [handleOpenRecord]
  );

  const handleCreateRecord = React.useCallback(
    async (
      fields?: Record<string, DatabaseCellInput>,
      order?: DatabaseRecordOrder
    ) => {
      try {
        await databaseRecords.create(database.id, fields ?? {}, order);
      } catch (err) {
        toast.error(t("Couldn’t create the row"));
        throw err;
      }
    },
    [databaseRecords, database.id, t]
  );

  const handleNew = React.useCallback(async () => {
    try {
      const record = await databaseRecords.create(
        database.id,
        newRecordDefaults(database, view)
      );
      await handleOpenRecord(record.id);
    } catch (_err) {
      toast.error(t("Couldn’t create the row"));
    }
  }, [databaseRecords, database, view, handleOpenRecord, t]);

  const [filterRequest, setFilterRequest] = React.useState<FilterRequest>();
  const [groupRequest, setGroupRequest] = React.useState<number>();
  const handleEditGroups = React.useCallback(
    () => setGroupRequest(Date.now()),
    []
  );

  const handleFilter = React.useCallback(
    (fieldId: string) => {
      const field = database.fieldById(fieldId);
      const item = field
        ? createFilterItem(
            field,
            Intl.DateTimeFormat().resolvedOptions().timeZone
          )
        : undefined;
      if (!item) {
        return;
      }
      const canSave = canSaveView(view, readOnly);
      const current = draftFilter(
        view,
        viewDrafts.get(database.id, view.id),
        canSave
      ) ?? { conjunction: "and", filterSet: [] };
      const next = appendFilterNode(current, [], item);
      viewDrafts.set(
        database.id,
        view.id,
        canSave ? { filter: next } : { extraFilter: next }
      );
      setFilterRequest({ fieldId, at: Date.now() });
    },
    [database, view, readOnly]
  );

  const context = React.useMemo(
    () => ({
      onViewCreated,
      filterRequest,
      groupRequest,
      onEditGroups: handleEditGroups,
    }),
    [onViewCreated, filterRequest, groupRequest, handleEditGroups]
  );

  const viewProps: TableViewProps = {
    database,
    view,
    query,
    readOnly,
    onOpenRecord: handleOpen,
    onCreateRecord: readOnly ? undefined : handleCreateRecord,
    onFilter: handleFilter,
  };

  return (
    <DatabaseBlockContext.Provider value={context}>
      {headingAbove && (
        <HeaderRow>
          {heading}
          {options}
        </HeaderRow>
      )}
      <ViewTabs
        database={database}
        views={views}
        activeViewId={view.id}
        readOnly={readOnly}
        onSelect={onSelectView}
        onViewCreated={onViewCreated}
        lead={headingAbove ? undefined : heading}
        actions={
          <>
            <DatabaseToolbar
              database={database}
              view={view}
              query={query}
              readOnly={readOnly}
            />
            {!fullPage && (
              <OpenFullPageButton database={database} documentId={documentId} />
            )}
            <SearchBox value={search} onChange={setSearch} />
            {!readOnly && (
              <NewRecordMenu
                database={database}
                view={view}
                canEditView={!readOnly}
                defaults={newRecordDefaults(database, view)}
                onCreateEmpty={handleNew}
                onOpenRecord={handleOpenRecord}
              />
            )}
            {!headingAbove && options}
          </>
        }
      />
      <ViewArea $fullPage={fullPage}>
        <React.Suspense fallback={<Skeleton label={t("Loading the view…")} />}>
          {renderView(view.layout, viewProps, t)}
        </React.Suspense>
      </ViewArea>
    </DatabaseBlockContext.Provider>
  );
});

/**
 * The block's own menu, for people who can edit the page: copy a link to the
 * database, switch between inline and full page, remove the block.
 */
const BlockOptions = observer(function BlockOptions({
  databaseId,
  fullPage,
  hideTitle,
  isEditable,
  actions,
  floating,
}: {
  databaseId: string;
  fullPage: boolean;
  hideTitle: boolean;
  isEditable: boolean;
  actions: NodeActions;
  floating?: boolean;
}) {
  const { t } = useTranslation();
  const makeHostFullWidth = useFullWidthHost();
  const share = useDatabaseShare();
  const { dialogs, databases, policies } = useStores();
  const canAutomate =
    !share.isShare &&
    !!policies.abilities(databaseId).update &&
    !!databases.get(databaseId)?.isSchemaLoaded;

  const menu = useMenuAction([
    createAction({
      name: t("Copy link to database"),
      section: "Database",
      icon: <LinkIcon />,
      visible: share.canLinkToDatabase,
      perform: () => {
        copy(`${window.location.origin}${databasePath(databaseId)}`);
        toast.success(t("Link copied to clipboard"));
      },
    }),
    createAction({
      name: fullPage ? t("Show inline") : t("Show as full page"),
      section: "Database",
      icon: <AlignFullWidthIcon />,
      visible: isEditable,
      perform: () => {
        if (!fullPage) {
          makeHostFullWidth();
        }
        actions.updateAttrs({ fullPage: !fullPage });
      },
    }),
    createAction({
      name: hideTitle ? t("Show database title") : t("Hide database title"),
      section: "Database",
      icon: hideTitle ? <EyeIcon /> : <HiddenIcon />,
      visible: isEditable && !fullPage,
      perform: () => actions.updateAttrs({ hideTitle: !hideTitle }),
    }),
    createAction({
      name: t("Automations"),
      section: "Database",
      icon: <LightningIcon />,
      visible: canAutomate,
      perform: () => {
        const database = databases.get(databaseId);
        if (database) {
          openDatabaseAutomations({ dialogs, database, t });
        }
      },
    }),
    createAction({
      name: t("Remove from page"),
      section: "Database",
      icon: <TrashIcon />,
      dangerous: true,
      visible: isEditable,
      perform: () => actions.remove(),
    }),
  ]);

  if (!share.canLinkToDatabase && !isEditable && !canAutomate) {
    return null;
  }

  return (
    <OptionsAnchor $floating={!!floating}>
      <DropdownMenu action={menu} ariaLabel={t("Database options")} align="end">
        <IconButton type="button" aria-label={t("Database options")}>
          <DragHandleIcon size={18} />
        </IconButton>
      </DropdownMenu>
    </OptionsAnchor>
  );
});

function renderView(
  layout: DatabaseLayout,
  props: TableViewProps,
  t: (key: string) => string
) {
  switch (layout) {
    case DatabaseLayout.Board:
      return <BoardView {...props} />;
    case DatabaseLayout.Table:
      return <TableView {...props} />;
    case DatabaseLayout.Calendar:
      return <CalendarView {...props} />;
    case DatabaseLayout.Gallery:
      return <GalleryView {...props} />;
    case DatabaseLayout.List:
      return <ListView {...props} />;
    case DatabaseLayout.Timeline:
      return <TimelineView {...props} />;
    case DatabaseLayout.Form:
      return props.readOnly ? (
        <Notice>{t("This kind of view is not supported yet.")}</Notice>
      ) : (
        <FormSharing database={props.database} view={props.view} />
      );
    default:
      return <Notice>{t("This kind of view is not supported yet.")}</Notice>;
  }
}

/**
 * The values of a row created with « New »: on a board, the first shown
 * column, so that the card does not land in a hidden one.
 */
function newRecordDefaults(
  database: Database,
  view: DatabaseView
): Record<string, DatabaseCellInput> {
  if (view.layout !== DatabaseLayout.Board || !view.options.stackFieldId) {
    return {};
  }
  const field = database.fieldById(view.options.stackFieldId);
  if (!field || !isStackable(field)) {
    return {};
  }
  const first = boardColumns(field, view).visible[0];
  return first ? { [field.id]: stackValue(first.key) } : {};
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(!!value);
  const [text, setText] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => onChange(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text, onChange]);

  React.useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const close = React.useCallback(() => {
    setText("");
    setIsOpen(false);
  }, []);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    },
    [close]
  );

  const handleBlur = React.useCallback(() => {
    if (!text) {
      setIsOpen(false);
    }
  }, [text]);

  if (!isOpen) {
    return (
      <Tooltip content={t("Search")}>
        <IconButton
          type="button"
          aria-label={t("Search")}
          onClick={() => setIsOpen(true)}
        >
          <SearchIcon size={18} />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <SearchField>
      <SearchIcon size={18} />
      <SearchInput
        ref={inputRef}
        value={text}
        placeholder={t("Type to search…")}
        aria-label={t("Search")}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {text && (
        <IconButton
          type="button"
          aria-label={t("Clear search")}
          onClick={close}
        >
          <CloseIcon size={16} />
        </IconButton>
      )}
    </SearchField>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <SkeletonWrapper role="status" aria-label={label}>
      <SkeletonBar $width={180} $height={22} />
      <SkeletonBar $width={320} $height={14} />
      <SkeletonRow>
        <SkeletonBar $width={220} $height={96} />
        <SkeletonBar $width={220} $height={96} />
        <SkeletonBar $width={220} $height={96} />
      </SkeletonRow>
    </SkeletonWrapper>
  );
}

const OptionsAnchor = styled.div<{ $floating: boolean }>`
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 100ms ease-in-out;

  ${(props) =>
    props.$floating &&
    css`
      position: absolute;
      top: 8px;
      right: 8px;
    `}

  &:focus-within,
  &:has([data-state="open"]) {
    opacity: 1;
  }

  @media (hover: none) {
    opacity: 1;
  }
`;

const Frame = styled.div<{
  $fullPage: boolean;
  $selected?: boolean;
  /** Framed, for the states that are not a database yet: picker, errors. */
  $boxed?: boolean;
}>`
  position: relative;
  margin: ${(props) => (props.$fullPage ? "4px 0 16px" : "8px 0 12px")};
  white-space: normal;
  cursor: auto;
  user-select: text;
  font-size: 14px;
  line-height: 1.5;

  ${(props) =>
    props.$fullPage &&
    css`
      --database-view-max-height: calc(100vh - 220px);
    `}

  ${(props) =>
    props.$boxed &&
    css`
      padding: 12px 14px 6px;
      border: 1px solid ${props.theme.divider};
      border-radius: 12px;
    `}

  &:hover ${OptionsAnchor} {
    opacity: 1;
  }

  ${(props) =>
    props.$selected &&
    css`
      outline: 2px solid ${props.theme.selected};
      outline-offset: 4px;
      border-radius: 4px;
    `}
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;

  > :first-child {
    flex: 1;
    min-width: 0;
  }
`;

const ViewArea = styled.div<{ $fullPage: boolean }>`
  position: relative;
  min-width: 0;
  padding-top: 8px;
`;

const Notice = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 4px;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

const NoticeButton = styled.button`
  height: 26px;
  padding: 0 8px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  background: none;
  color: ${s("text")};
  font: inherit;
  font-size: 13px;
  cursor: var(--pointer);
`;

const IconButton = styled.button`
  display: flex;
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

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const SearchField = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 200px;
  height: 28px;
  padding: 0 2px 0 6px;
  border-radius: 6px;
  background: ${s("inputBackground")};
  color: ${s("textTertiary")};
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: none;
  color: ${s("text")};
  font: inherit;
  font-size: 14px;

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

const SkeletonWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 12px;
`;

const SkeletonRow = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 6px;
`;

const SkeletonBar = styled.div<{ $width: number; $height: number }>`
  width: ${(props) => props.$width}px;
  max-width: 100%;
  height: ${(props) => props.$height}px;
  border-radius: 6px;
  background: ${(props) =>
    props.theme.isDark
      ? "rgba(255, 255, 255, 0.05)"
      : "rgba(55, 53, 47, 0.06)"};
  animation: database-skeleton 1.4s ease-in-out infinite;

  @keyframes database-skeleton {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }
`;

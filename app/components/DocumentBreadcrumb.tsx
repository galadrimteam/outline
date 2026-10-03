import type { TFunction } from "i18next";
import { observer } from "mobx-react";
import { ArchiveIcon, GoToIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Icon from "@shared/components/Icon";
import { ellipsis } from "@shared/styles";
import type Collection from "~/models/Collection";
import type Database from "~/models/Database";
import type Document from "~/models/Document";
import Breadcrumb from "~/components/Breadcrumb";
import Tooltip from "~/components/Tooltip";
import CollectionIcon from "~/components/Icons/CollectionIcon";
import { ContextMenu } from "~/components/Menu/ContextMenu";
import { ActionContextProvider } from "~/hooks/useActionContext";
import { useCollectionMenuAction } from "~/hooks/useCollectionMenuAction";
import { useDocumentMenuAction } from "~/hooks/useDocumentMenuAction";
import { useLocationSidebarContext } from "~/hooks/useLocationSidebarContext";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { archivePath, trashPath } from "~/utils/routeHelpers";
import { createInternalLinkAction } from "~/actions";
import { ActiveDocumentSection } from "~/actions/sections";

/**
 * Returns the breadcrumb parts leading up to a document, separating the
 * (possibly deleted) collection label from ancestor document titles. The
 * document itself is not included.
 *
 * @param document - the document to compute the breadcrumb for.
 * @param t - translation function for fallback titles.
 * @returns the collection label and ancestor titles.
 */
export function documentBreadcrumbParts(
  document: Document,
  t: TFunction
): { collection: string | undefined; ancestors: string[] } {
  let collectionLabel: string | undefined;
  if (document.isCollectionDeleted) {
    collectionLabel = t("Deleted Collection");
  } else if (document.collection?.name) {
    collectionLabel = document.collection.name;
  }

  return {
    collection: collectionLabel,
    ancestors: document.pathTo
      .slice(0, -1)
      .map((node) => node.title || t("Untitled")),
  };
}

/**
 * Returns the breadcrumb path leading up to a document as a plain text
 * string. Includes the collection name (or "Deleted Collection" fallback)
 * and any ancestor document titles, slash-separated.
 *
 * @param document - the document to compute the breadcrumb for.
 * @param t - translation function for fallback titles.
 * @returns the breadcrumb as a slash-separated string, or undefined if the
 * document has no resolvable parent context.
 */
export function documentBreadcrumbText(
  document: Document,
  t: TFunction
): string | undefined {
  const parts = documentBreadcrumbParts(document, t);
  const segments = [
    ...(parts.collection ? [parts.collection] : []),
    ...parts.ancestors,
  ];
  return segments.length ? segments.join(" / ") : undefined;
}

/** The part of a navigation node that a breadcrumb item is rendered from. */
type BreadcrumbNode = {
  id: string;
  title: string;
  url: string;
  icon?: string;
  color?: string;
};

/**
 * galadrim: returns the documents to render in the breadcrumb of a document,
 * after the collection. Upstream lists the ancestors only; the top bar of a
 * Notion page ends with the page itself, which `includeCurrent` adds using the
 * live title and icon of the document rather than those of the collection
 * structure, which lag behind while the title is being edited, preceded by the
 * database of a row page when one is given.
 *
 * @param document - the document to compute the breadcrumb for.
 * @param includeCurrent - whether the document itself is the last item.
 * @param database - the database of a row page, see `rowDatabaseNode`.
 * @returns the nodes to render, outermost first.
 */
export function documentBreadcrumbNodes(
  document: Pick<Document, "id" | "title" | "url" | "icon" | "color"> & {
    pathTo: BreadcrumbNode[];
  },
  includeCurrent = false,
  database?: BreadcrumbNode
): BreadcrumbNode[] {
  const { pathTo } = document;

  if (!includeCurrent) {
    return pathTo.slice(0, -1);
  }

  // The path ends with the document itself, unless it is empty: a draft that is
  // not in the collection structure and has no parent loaded.
  const last = pathTo[pathTo.length - 1];
  const ancestors = last?.id === document.id ? pathTo.slice(0, -1) : pathTo;

  return [
    ...ancestors,
    ...(database ? [database] : []),
    {
      id: document.id,
      title: document.title,
      url: document.url,
      icon: document.icon ?? undefined,
      color: document.color ?? undefined,
    },
  ];
}

/**
 * galadrim: the breadcrumb item of the database of a row page, as Notion's top
 * bar names the database before its row. Left out when the row page sits under
 * the home page of its database, which the path already shows.
 *
 * @param document - the page, a database row or not.
 * @param database - its database, once loaded.
 * @param untitled - the title of a database without one.
 * @returns the item, or undefined when there is none to add.
 */
export function rowDatabaseNode(
  document: Pick<Document, "databaseId" | "parentDocumentId">,
  database:
    | Pick<Database, "id" | "title" | "icon" | "url" | "documentId">
    | undefined,
  untitled: string
): BreadcrumbNode | undefined {
  if (
    !database ||
    database.id !== document.databaseId ||
    (!!database.documentId && database.documentId === document.parentDocumentId)
  ) {
    return undefined;
  }
  return {
    id: database.id,
    title: database.title || untitled,
    url: database.url || `/db/${database.id}`,
    icon: database.icon ?? undefined,
  };
}

type Props = {
  children?: React.ReactNode;
  document: Document;
  onlyText?: boolean;
  /**
   * galadrim: also show the document itself as the last item, and one more
   * item before the middle of the path collapses into a menu.
   */
  showCurrent?: boolean;
  /**
   * Maximum number of ancestor documents to show, counted back from the
   * document's immediate parent. Any ancestors beyond this depth are replaced
   * with an ellipsis. The collection is always shown. If undefined, all
   * ancestors are shown. If less than or equal to 0, no items are shown.
   */
  maxDepth?: number;
};

function DocumentBreadcrumb(
  { document, children, onlyText, maxDepth, showCurrent }: Props,
  ref: React.RefObject<HTMLDivElement> | null
) {
  const { collections, databases } = useStores();
  const { t } = useTranslation();
  const sidebarContext = useLocationSidebarContext();
  const collection = document.collectionId
    ? collections.get(document.collectionId)
    : undefined;
  const can = usePolicy(collection);
  const depth = maxDepth === undefined ? undefined : Math.max(0, maxDepth);

  React.useEffect(() => {
    // A reader of a page may not read its collection (a linked view, a guest): the breadcrumb then shows less.
    document.loadRelations({ withoutPolicies: true }).catch(() => undefined);
  }, [document]);

  const database = showCurrent
    ? rowDatabaseNode(
        document,
        document.databaseId ? databases.get(document.databaseId) : undefined,
        t("Untitled database")
      )
    : undefined;
  const path = documentBreadcrumbNodes(document, showCurrent, database);

  const actions = React.useMemo(() => {
    if (depth === 0) {
      return [];
    }

    // Root items (trash / archive / collection) are always retained so the
    // collection can still be shown when visible, even for small depths.
    const rootActions = [
      createInternalLinkAction({
        name: t("Trash"),
        section: ActiveDocumentSection,
        icon: <TrashIcon />,
        visible: document.isDeleted,
        to: trashPath(),
      }),
      createInternalLinkAction({
        name: t("Archive"),
        section: ActiveDocumentSection,
        icon: <ArchiveIcon />,
        visible: document.isArchived,
        to: archivePath(),
      }),
      createInternalLinkAction({
        name: collection ? (
          <CollectionName
            collection={collection}
            icon={<CollectionIcon collection={collection} expanded />}
          />
        ) : undefined,
        section: ActiveDocumentSection,
        visible: !!(collection && can.readDocument),
        to: collection
          ? {
              pathname: collection.path,
              state: { sidebarContext },
            }
          : "",
      }),
      createInternalLinkAction({
        name: t("Deleted Collection"),
        section: ActiveDocumentSection,
        visible: document.isCollectionDeleted,
        to: "",
      }),
    ];

    const ancestorActions = path.map((node) => {
      const title = node.title || t("Untitled");
      return createInternalLinkAction({
        name: (
          <DocumentName
            documentId={node.id}
            collection={collection}
            title={title}
            icon={
              node.icon ? (
                <Icon
                  value={node.icon}
                  color={node.color}
                  initial={title.charAt(0).toUpperCase()}
                />
              ) : undefined
            }
          />
        ),
        section: ActiveDocumentSection,
        to: {
          pathname: node.url,
          state: { sidebarContext },
        },
      });
    });

    // Depth is counted back from the document's parent, so keep the ancestors
    // nearest the document.
    return [
      ...rootActions,
      ...(depth !== undefined
        ? ancestorActions.slice(-depth)
        : ancestorActions),
    ];
  }, [t, document, collection, can.readDocument, sidebarContext, path, depth]);

  if (!collections.isLoaded) {
    return null;
  }

  if (onlyText) {
    if (depth === 0) {
      return <></>;
    }

    const { collection: collectionLabel, ancestors: ancestorLabels } =
      documentBreadcrumbParts(document, t);

    // Depth is measured back from the document's parent, so keep the trailing
    // ancestors nearest to the document and collapse anything beyond into an
    // ellipsis. The collection is always shown.
    const tail =
      depth === undefined ? ancestorLabels : ancestorLabels.slice(-depth);
    const omitted = ancestorLabels.slice(
      0,
      ancestorLabels.length - tail.length
    );

    const segments: React.ReactNode[] = [
      ...(collectionLabel ? [collectionLabel] : []),
      ...(omitted.length
        ? [
            <Tooltip key="ellipsis" content={omitted.join(" / ")}>
              <Ellipsis>…</Ellipsis>
            </Tooltip>,
          ]
        : []),
      ...tail,
    ];

    return (
      <>
        {segments.map((label, index) => (
          <React.Fragment key={index}>
            {index !== 0 && <SmallSlash />}
            {label}
          </React.Fragment>
        ))}
      </>
    );
  }

  return (
    <Breadcrumb
      actions={actions}
      ref={ref}
      max={showCurrent ? 3 : undefined}
      highlightFirstItem
    >
      {children}
    </Breadcrumb>
  );
}

/** Renders a collection name and icon wrapped in a context menu. */
const CollectionName = observer(function CollectionName_({
  collection,
  icon,
}: {
  collection: Collection;
  icon?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const menuAction = useCollectionMenuAction({
    collectionId: collection.id,
  });

  return (
    <ActionContextProvider value={{ activeModels: [collection] }}>
      <ContextMenu action={menuAction} ariaLabel={t("Collection options")}>
        <Name>
          {icon}
          <NameText>{collection.name}</NameText>
        </Name>
      </ContextMenu>
    </ActionContextProvider>
  );
});

/** Renders a document name and icon wrapped in a context menu. */
const DocumentName = observer(function DocumentName_({
  documentId,
  collection,
  title,
  icon,
}: {
  documentId: string;
  collection: Collection | undefined;
  title: string;
  icon?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { documents } = useStores();
  const doc = documents.get(documentId);
  const menuAction = useDocumentMenuAction({ documentId });

  if (!doc) {
    return (
      <Name>
        {icon}
        <NameText>{title}</NameText>
      </Name>
    );
  }

  return (
    <ActionContextProvider
      value={{
        activeModels: [doc, ...(collection ? [collection] : [])],
      }}
    >
      <ContextMenu action={menuAction} ariaLabel={t("Document options")}>
        <Name>
          {icon}
          <NameText>{title}</NameText>
        </Name>
      </ContextMenu>
    </ActionContextProvider>
  );
});

const Name = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
`;

const NameText = styled.span`
  ${ellipsis()}
  min-width: 0;
`;

const Ellipsis = styled.span`
  cursor: default;
`;

const SmallSlash = styled(GoToIcon)`
  width: 12px;
  height: 12px;
  vertical-align: middle;
  flex-shrink: 0;

  fill: ${(props) => props.theme.textTertiary};
  opacity: 0.5;
`;

export default observer(React.forwardRef(DocumentBreadcrumb));

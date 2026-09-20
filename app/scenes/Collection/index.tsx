import { observer } from "mobx-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useParams,
  useHistory,
  useRouteMatch,
  useLocation,
  Redirect,
} from "react-router-dom";
import styled from "styled-components";
import { toError } from "@shared/utils/error";
import { s } from "@shared/styles";
import { StatusFilter } from "@shared/types";
import type Collection from "~/models/Collection";
import type DocumentsStore from "~/stores/DocumentsStore";
import CenteredContent from "~/components/CenteredContent";
import { CollectionBreadcrumb } from "~/components/CollectionBreadcrumb";
import Heading from "~/components/Heading";
import CollectionIcon from "~/components/Icons/CollectionIcon";
import InputSearchPage from "~/components/InputSearchPage";
import PlaceholderList from "~/components/List/Placeholder";
import PaginatedDocumentList from "~/components/PaginatedDocumentList";
import PinnedDocuments from "~/components/PinnedDocuments";
import PlaceholderText from "~/components/PlaceholderText";
import Scene from "~/components/Scene";
import { editCollection } from "~/actions/definitions/collections";
import useCommandBarActions from "~/hooks/useCommandBarActions";
import { useTrackLastVisitedPath } from "~/hooks/useLastVisitedPath";
import { useLocationSidebarContext } from "~/hooks/useLocationSidebarContext";
import { usePinnedDocuments } from "~/hooks/usePinnedDocuments";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { NotFoundError } from "~/utils/errors";
import {
  collectionPath,
  matchCollectionEdit,
  updateCollectionPath,
} from "~/utils/routeHelpers";
import Error404 from "../Errors/Error404";
import Actions from "./components/Actions";
import DropToImport from "./components/DropToImport";
import Empty from "./components/Empty";
import MembershipPreview from "./components/MembershipPreview";
import Notices from "./components/Notices";
import Overview from "./components/Overview";
import { Header } from "./components/Header";
import useCurrentUser from "~/hooks/useCurrentUser";
import { ProsemirrorDataHelper } from "@shared/utils/ProsemirrorDataHelper";
import {
  getLinkedDocumentKeys,
  isLinkedDocument,
} from "~/scenes/Document/components/linkedDocuments";

const CollectionScene = observer(function CollectionScene_() {
  const params = useParams<{ collectionSlug?: string; tab?: string }>();
  const history = useHistory();
  const match = useRouteMatch();
  const location = useLocation();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { documents, collections, shares, ui } = useStores();
  const [error, setError] = useState<Error | undefined>();
  const currentPath = location.pathname;
  useTrackLastVisitedPath(currentPath);
  const sidebarContext = useLocationSidebarContext();
  const isEditRoute = match.path === matchCollectionEdit;

  const id = params.collectionSlug || "";
  const urlId = id.split("-").pop() ?? "";

  const collection = collections.get(id);
  const can = usePolicy(collection);
  const hasDescription = collection?.data
    ? !ProsemirrorDataHelper.isEmpty(collection.data)
    : false;

  const { pins, count } = usePinnedDocuments(urlId, collection?.id);

  useEffect(() => {
    if (collection?.name) {
      const canonicalUrl = updateCollectionPath(match.url, collection);

      if (match.url !== canonicalUrl) {
        history.replace(canonicalUrl, history.location.state);
      }
    }
  }, [collection, collection?.name, history, id, match.url]);

  useEffect(() => {
    if (collection) {
      ui.setActiveCollection(collection.id);
    }

    return () => ui.setActiveCollection(undefined);
  }, [ui, collection]);

  useEffect(() => {
    async function fetchData() {
      try {
        setError(undefined);
        await collections.fetch(id);
      } catch (err) {
        setError(toError(err));
      }
    }

    void fetchData();
    // Fetched once on mount, the slug in `id` also changes when the collection
    // is renamed which must not trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (collection) {
      shares.fetchOne({ collectionId: collection.id }).catch((err) => {
        if (!(err instanceof NotFoundError)) {
          throw err;
        }
      });
    }
  }, [shares, collection]);

  useCommandBarActions([editCollection], [ui.activeCollectionId ?? "none"]);

  if (!collection && error) {
    return <Error404 />;
  }
  if (!collection) {
    return <Loading />;
  }

  const readOnly = !can.update || (!isEditRoute && !!user?.separateEditMode);

  // An empty overview is only rendered for those that can currently type in it,
  // readers go straight to the list of documents.
  const showOverview = hasDescription || !readOnly;
  const isLegacyTabRoute = !!params.tab && !isEditRoute;

  return (
    <Scene
      centered={false}
      textTitle={collection.name}
      left={
        collection.isArchived ? (
          <CollectionBreadcrumb collection={collection} />
        ) : (
          <InputSearchPage
            source="collection"
            placeholder={`${t("Search in collection")}…`}
            label={t("Search in collection")}
            collectionId={collection.id}
          />
        )
      }
      title={
        <>
          <CollectionIcon collection={collection} expanded />
          &nbsp;{collection.name}
        </>
      }
      actions={
        <>
          <MembershipPreview collection={collection} />
          <Actions
            collection={collection}
            isEditing={isEditRoute}
            sidebarContext={sidebarContext}
          />
        </>
      }
    >
      <DropToImport
        accept={documents.importFileTypesString}
        disabled={!can.createDocument}
        collectionId={collection.id}
      >
        <CenteredContent withStickyHeader>
          <Notices collection={collection} />
          <Header
            collection={collection}
            isEditing={isEditRoute || !user?.separateEditMode}
          />

          <PinnedDocuments
            pins={pins}
            placeholderCount={count}
            collapseKey={collection.id}
          />

          <Content>
            {/* The collection used to be split into tabs, links to them now
                lead to the single collection page. */}
            {isLegacyTabRoute && (
              <Redirect
                to={{
                  pathname: collectionPath(collection),
                  search: location.search,
                  hash: location.hash,
                  state: location.state ?? { sidebarContext },
                }}
              />
            )}
            {showOverview && (
              <OverviewContainer $empty={!hasDescription}>
                <Overview collection={collection} readOnly={readOnly} compact />
              </OverviewContainer>
            )}
            <CollectionDocuments
              collection={collection}
              documents={documents}
            />
          </Content>
        </CenteredContent>
      </DropToImport>
    </Scene>
  );
});

const Loading = () => (
  <CenteredContent>
    <Heading>
      <PlaceholderText height={35} />
    </Heading>
    <PlaceholderList count={5} />
  </CenteredContent>
);

const KeyedCollection = () => {
  const params = useParams<{ id?: string }>();

  // Forced mount prevents animation of pinned documents when navigating
  // _between_ collections, speeds up perceived performance.
  return <CollectionScene key={params.id} />;
};

const Content = styled.div`
  position: relative;
  background: ${s("background")};
`;

// galadrim: an empty overview is a single blank line (its placeholder only
// shows on hover or focus), the documents follow it without a further gap.
const OverviewContainer = styled.div<{ $empty: boolean }>`
  margin-bottom: ${(props) => (props.$empty ? 0 : 24)}px;
`;

const CollectionDocuments = observer(
  ({
    collection,
    documents,
  }: {
    collection: Collection;
    documents: DocumentsStore;
  }) => {
    // The document structure is cached on the collection once loaded, so this
    // is a no-op when the sidebar has already requested it.
    useEffect(() => {
      void collection.fetchDocuments();
    }, [collection]);

    if (collection.isEmpty) {
      return <Empty collection={collection} />;
    }

    if (collection.isArchived) {
      return (
        <PaginatedDocumentList
          documents={documents.archivedInCollection(collection.id)}
          fetch={documents.fetchPage}
          options={{
            collectionId: collection.id,
            parentDocumentId: null,
            sort: collection.sort.field,
            direction: collection.sort.direction,
            statusFilter: [StatusFilter.Archived],
          }}
          showParentDocuments
          compact
        />
      );
    }

    // galadrim: a page that lists its sub-pages keeps that list, as in Notion. When such a page becomes a collection
    // its body becomes the overview, and Outline's own list underneath showed every one of them a second time.
    const linkedKeys = getLinkedDocumentKeys(collection.data);
    const roots = documents
      .rootInCollection(collection.id)
      .filter((node) => !isLinkedDocument(linkedKeys, node));

    if (!roots.length) {
      return null;
    }

    return (
      <PaginatedDocumentList
        documents={roots}
        fetch={documents.fetchPage}
        options={{
          collectionId: collection.id,
          parentDocumentId: null,
          sort: collection.sort.field,
          direction: collection.sort.direction,
        }}
        showParentDocuments
        compact
      />
    );
  }
);

export default KeyedCollection;

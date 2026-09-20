import { observer } from "mobx-react";
import { useEffect, useRef, Fragment, useMemo } from "react";
import { Trans } from "react-i18next";
import styled from "styled-components";
import type Document from "~/models/Document";
import type DocumentsStore from "~/stores/DocumentsStore";
import Fade from "~/components/Fade";
import { determineSidebarContext } from "~/components/Sidebar/components/SidebarContext";
import { Tab, Tabs } from "~/components/Tabs";
import useCurrentUser from "~/hooks/useCurrentUser";
import { useLocationSidebarContext } from "~/hooks/useLocationSidebarContext";
import useStores from "~/hooks/useStores";
import ReferenceListItem from "./ReferenceListItem";
import useShare from "@shared/hooks/useShare";
import type { NavigationNode } from "@shared/types";
import { flattenTree } from "@shared/utils/tree";

type Props = {
  document: Document;
};

function References({ document }: Props) {
  const { documents } = useStores();
  const user = useCurrentUser({ rejectOnEmpty: false });
  const locationSidebarContext = useLocationSidebarContext();
  const { sharedTree, isShare } = useShare();
  const isJustCreated = useMemo(
    () => document.isJustCreated,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document.id]
  );

  useEffect(() => {
    if (!isShare && !isJustCreated) {
      void documents.fetchRelationships(document.id);
    }
  }, [isShare, documents, document.id, isJustCreated]);

  // galadrim: a Notion page lists its sub-pages in its body and in the sidebar,
  // never in a "Documents" list at its foot, and it does not count the page it
  // is nested under among its backlinks. So the list of children and the "New
  // doc" row that followed it are gone, and ancestors are filtered out of the
  // backlinks. Listing only the children the body does not link to was not
  // enough: measured over the 10 779 imported documents on 2026-09-20, 87% of
  // the 10 449 children are never referenced by their parent's text, and the
  // 501 pages that were Notion databases have an empty body and up to 423
  // children each — the list was at its longest exactly where Notion shows
  // nothing.
  const allBacklinks = useBacklinks(document, sharedTree);
  const ancestorIds = useAncestorIds(document, documents);
  const backlinks = useMemo(
    () => allBacklinks.filter((node) => !ancestorIds.has(node.id)),
    [allBacklinks, ancestorIds]
  );

  const shouldFade = useRef(!backlinks.length);
  const Component = shouldFade.current ? Fade : Fragment;

  return backlinks.length ? (
    <Component>
      <Tabs>
        <Tab active>
          <Trans>Backlinks</Trans>
        </Tab>
      </Tabs>
      <Content style={{ height: backlinks.length * 40 }}>
        <List>
          {backlinks.map((node) => {
            // If we have the document in the store already then use it to get the extra
            // contextual info, otherwise the collection node will do (only has title and id)
            const backlinkedDocument = documents.get(node.id);
            return (
              <ReferenceListItem
                anchor={backlinkedDocument?.urlId}
                key={node.id}
                document={backlinkedDocument || node}
                showCollection={
                  backlinkedDocument?.collectionId !== document.collectionId
                }
                sidebarContext={
                  user && backlinkedDocument
                    ? determineSidebarContext({
                        document: backlinkedDocument,
                        user,
                        currentContext: locationSidebarContext,
                      })
                    : undefined
                }
              />
            );
          })}
        </List>
      </Content>
    </Component>
  ) : null;
}

/**
 * Hook to get backlinks for a document, filtering from the shared tree if available.
 *
 * @param document - the document to get backlinks for.
 * @returns documents that link to this document.
 */
function useBacklinks(
  document: Document,
  sharedTree: NavigationNode | undefined
): Document[] {
  if (sharedTree) {
    return flattenTree(sharedTree).filter((node) =>
      document.backlinkIds?.includes(node.id)
    ) as Document[];
  }
  return document.backlinks;
}

/**
 * galadrim: the identifiers of a document and of the documents it is nested
 * under. Walking up `parentDocumentId` costs one lookup per level, where
 * `document.pathTo` walks the whole collection tree without a cache and
 * allocates an array per node (Collection.pathToDocument) — this component is
 * an observer that re-renders on every autosave.
 *
 * @param document - the document whose ancestors are wanted.
 * @param documents - the documents store, to look parents up in.
 * @returns the set of ancestor identifiers, including the document's own.
 */
export function ancestorIdsOf(
  document: Pick<Document, "id" | "parentDocumentId">,
  documents: Pick<DocumentsStore, "get">
): Set<string> {
  const ids = new Set<string>([document.id]);
  let parentId = document.parentDocumentId;

  while (parentId && !ids.has(parentId)) {
    ids.add(parentId);
    parentId = documents.get(parentId)?.parentDocumentId;
  }

  return ids;
}

function useAncestorIds(
  document: Document,
  documents: DocumentsStore
): Set<string> {
  return useMemo(
    () => ancestorIdsOf(document, documents),
    // The walk only depends on where the document sits in the tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, document.id, document.parentDocumentId]
  );
}

const Content = styled.div`
  position: relative;
`;

const List = styled.ul`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  list-style: none;
  margin: 0;
  padding: 0;
`;

export default observer(References);

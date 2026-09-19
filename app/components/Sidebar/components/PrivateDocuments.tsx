import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type Collection from "~/models/Collection";
import Flex from "~/components/Flex";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { preloadEditor } from "~/routes/scenes";
import { newDocumentPath } from "~/utils/routeHelpers";
import CollectionLinkChildren from "./CollectionLinkChildren";
import Header from "./Header";
import Relative from "./Relative";
import SidebarContext from "./SidebarContext";
import SidebarLink from "./SidebarLink";

type Props = {
  /** The current user's private collection, see usePrivateCollection. */
  collection: Collection | undefined;
};

/**
 * galadrim: Notion's "Private" sidebar section. Lists the documents of the
 * member's own private collection directly under the heading, as if the
 * collection level did not exist. Renders nothing when the member has no such
 * collection – it is created by the Notion importer, never from the client.
 */
function PrivateDocuments({ collection }: Props) {
  const { documents } = useStores();
  const { t } = useTranslation();
  const can = usePolicy(collection);

  // The documents still belong to a collection, so they share the sidebar
  // context of the collections section: the collection itself is not listed
  // there, which leaves a single place where the active document highlights.
  const newDocumentTo = useMemo(
    () =>
      collection
        ? {
            pathname: newDocumentPath(collection.id),
            state: { sidebarContext: "collections" },
          }
        : undefined,
    [collection]
  );

  if (!collection) {
    return null;
  }

  return (
    <SidebarContext.Provider value="collections">
      <Flex column>
        <Header id="private" title={t("Private")}>
          <Relative>
            <CollectionLinkChildren
              collection={collection}
              expanded
              rootLevel
              prefetchDocument={documents.prefetchDocument}
            />
            {can.createDocument && (
              <SidebarLink
                to={newDocumentTo}
                icon={<PlusIcon />}
                label={t("New page")}
                onClickIntent={preloadEditor}
                depth={0}
              />
            )}
          </Relative>
        </Header>
      </Flex>
    </SidebarContext.Provider>
  );
}

export default observer(PrivateDocuments);

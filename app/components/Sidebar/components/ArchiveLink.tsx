import { isUndefined } from "es-toolkit/compat";
import { observer } from "mobx-react";
import { ArchiveIcon } from "outline-icons";
import type * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Flex from "@shared/components/Flex";
import type Collection from "~/models/Collection";
import PaginatedList from "~/components/PaginatedList";
import useRequest from "~/hooks/useRequest";
import useStores from "~/hooks/useStores";
import * as Scenes from "~/routes/scenes";
import { archivePath } from "~/utils/routeHelpers";
import { useDropToArchive } from "../hooks/useDragAndDrop";
import { ArchivedCollectionLink } from "./ArchivedCollectionLink";
import { StyledError } from "./Collections";
import PlaceholderCollections from "./PlaceholderCollections";
import Relative from "./Relative";
import SidebarContext from "./SidebarContext";
import SidebarLink from "./SidebarLink";

/**
 * galadrim: intentionally not mounted. Notion has no archive next to its
 * trash, so the sidebar row moved to the account menu (see AccountMenu) and
 * this component is kept only so that upstream changes to it keep applying
 * cleanly. Dragging a document onto the sidebar to archive it went with it;
 * archiving stays in the document menu.
 */
function ArchiveLink() {
  const { collections } = useStores();
  const { t } = useTranslation();

  const [disclosure, setDisclosure] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean | undefined>();
  const archivedCollections = collections.archived;
  const hasArchivedCollections = archivedCollections.length > 0;

  const { data, loading, error } = useRequest(collections.fetchArchived, true);

  useEffect(() => {
    if (!isUndefined(data) && !loading && isUndefined(error)) {
      setDisclosure(data.length > 0);
    }
  }, [data, loading, error]);

  useEffect(() => {
    setDisclosure(hasArchivedCollections);
  }, [hasArchivedCollections]);

  useEffect(() => {
    if (disclosure && isUndefined(expanded)) {
      setExpanded(false);
    }
  }, [disclosure, expanded]);

  const handleDisclosureClick = useCallback(
    (ev: React.MouseEvent<HTMLElement>) => {
      ev.preventDefault();
      ev.stopPropagation();
      setExpanded((e) => !e);
    },
    []
  );

  const handleClick = useCallback(() => {
    setExpanded(true);
  }, []);

  const [{ isOverArchiveSection, isDragging }, dropToArchiveRef] =
    useDropToArchive();

  return (
    <SidebarContext.Provider value="archive">
      <Flex column>
        <div ref={dropToArchiveRef}>
          <SidebarLink
            to={archivePath()}
            onClickIntent={Scenes.Archive.preload}
            icon={<ArchiveIcon open={isOverArchiveSection && isDragging} />}
            exact={false}
            label={t("Archive")}
            isActiveDrop={isOverArchiveSection && isDragging}
            depth={0}
            expanded={disclosure ? expanded : undefined}
            onDisclosureClick={handleDisclosureClick}
            onClick={handleClick}
          />
        </div>
        {expanded === true ? (
          <Relative>
            <PaginatedList<Collection>
              aria-label={t("Archived collections")}
              fetch={collections.fetchArchived}
              items={archivedCollections}
              loading={<PlaceholderCollections />}
              renderError={(props) => <StyledError {...props} />}
              renderItem={(item) => (
                <ArchivedCollectionLink
                  key={item.id}
                  depth={2}
                  collection={item}
                />
              )}
            />
          </Relative>
        ) : null}
      </Flex>
    </SidebarContext.Provider>
  );
}

export default observer(ArchiveLink);

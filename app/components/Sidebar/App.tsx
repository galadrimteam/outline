import { useKBar } from "kbar";
import { observer } from "mobx-react";
import { SearchIcon, HomeIcon, SidebarIcon } from "outline-icons";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  DragActiveProvider,
  SidebarScrollProvider,
} from "./components/DragActiveContext";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { SidebarSection, UserPreference } from "@shared/types";
import { metaDisplay } from "@shared/utils/keyboard";
import Scrollable from "~/components/Scrollable";
import { navigateToImport } from "~/actions/definitions/navigation";
import { inviteUser } from "~/actions/definitions/users";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useCurrentUser from "~/hooks/useCurrentUser";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import TeamMenu from "~/menus/TeamMenu";
import * as Scenes from "~/routes/scenes";
import { homePath } from "~/utils/routeHelpers";
import TeamLogo from "../TeamLogo";
import Tooltip from "../Tooltip";
import Sidebar from "./Sidebar";
import Collections from "./components/Collections";
import DraggableSection, {
  normalizeSidebarSectionOrder,
} from "./components/DraggableSection";
import { DraftsLink } from "./components/DraftsLink";
import DragPlaceholder from "./components/DragPlaceholder";
import PrivateDocuments from "./components/PrivateDocuments";
import { DismissableSidebarAction } from "./components/DismissableSidebarAction";
import HistoryNavigation from "./components/HistoryNavigation";
import Section from "./components/Section";
import SharedWithMe from "./components/SharedWithMe";
import SidebarButton from "./components/SidebarButton";
import SidebarLink from "./components/SidebarLink";
import Starred from "./components/Starred";
import ToggleButton from "./components/ToggleButton";
import TrashLink from "./components/TrashLink";
import useMobile from "~/hooks/useMobile";
import usePrivateCollection from "./hooks/usePrivateCollection";

function AppSidebar() {
  const { t } = useTranslation();
  const { documents, ui, collections } = useStores();
  const team = useCurrentTeam();
  const user = useCurrentUser();
  const can = usePolicy(team);
  const isMobile = useMobile();

  // galadrim: like Notion's quick find, search opens over the current page
  // (the command bar: recent documents, then instant title matches) instead of
  // replacing it. The full search page is one "Search documents for…" away.
  const { query: commandBar } = useKBar();
  const handleSearchClick = useCallback(() => {
    commandBar.toggle();
  }, [commandBar]);

  useEffect(() => {
    void collections.fetchAll();

    if (!user.isViewer) {
      void documents.fetchDrafts();
    }
  }, [documents, collections, user.isViewer]);

  // Scrollable reads ref.current internally for its shadow/ResizeObserver
  // logic, so we must pass an object ref — a callback ref would leave those
  // reads undefined. We mirror the attached node into state so the
  // SidebarScrollProvider can re-render descendants with the scroll element.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollArea, setScrollArea] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setScrollArea(scrollRef.current);
  }, []);

  const sectionOrder = normalizeSidebarSectionOrder(
    user.getPreference(UserPreference.SidebarSectionOrder, [])
  );

  // galadrim: Notion's "Private" section – the member's own private
  // collection is listed there instead of among the collections.
  const privateCollection = usePrivateCollection();

  const sectionContent = {
    [SidebarSection.Starred]: <Starred />,
    [SidebarSection.SharedWithMe]: <SharedWithMe />,
    [SidebarSection.Collections]: (
      <Collections privateCollectionId={privateCollection?.id} />
    ),
    [SidebarSection.Private]: (
      <PrivateDocuments collection={privateCollection} />
    ),
  };

  return (
    <Sidebar hidden={!ui.readyToShow}>
      <DragActiveProvider>
        <DragPlaceholder />

        <TeamMenu>
          <SidebarButton
            title={team.name}
            image={<TeamLogo model={team} size={24} alt={t("Logo")} />}
          >
            {isMobile ? null : (
              <Tooltip
                content={t("Toggle sidebar")}
                shortcut={`${metaDisplay}+.`}
              >
                <ToggleButton
                  position="bottom"
                  image={<SidebarIcon />}
                  aria-label={
                    ui.sidebarCollapsed
                      ? t("Expand sidebar")
                      : t("Collapse sidebar")
                  }
                  style={{ paddingInline: 4 }}
                  onClick={() => {
                    ui.toggleCollapsedSidebar();
                    (document.activeElement as HTMLElement)?.blur();
                  }}
                />
              </Tooltip>
            )}
          </SidebarButton>
        </TeamMenu>
        <Overflow>
          <Section>
            {/* galadrim: search comes first, as in Notion. */}
            <SidebarLink
              icon={<SearchIcon />}
              label={t("Search")}
              onClick={handleSearchClick}
              onClickIntent={Scenes.Search.preload}
            />
            <SidebarLink
              to={homePath()}
              icon={<HomeIcon />}
              exact={false}
              label={t("Home")}
              onClickIntent={Scenes.Home.preload}
            />
            {/* galadrim: Notion has no drafts – new documents are published to
                the private collection (see DocumentNew), so the link only shows
                while there are drafts. It stays in the account menu. */}
            {can.createDocument && documents.totalDrafts > 0 && <DraftsLink />}
          </Section>
        </Overflow>
        <Scrollable flex shadow ref={scrollRef}>
          <SidebarScrollProvider value={scrollArea}>
            {sectionOrder.map((section) => (
              <DraggableSection key={section} section={section}>
                {sectionContent[section]}
              </DraggableSection>
            ))}
            {/* galadrim: Notion has no archive next to its trash – the link
                moved to the account menu. */}
            <Section>
              {can.createDocument && <TrashLink />}
              <DismissableSidebarAction
                id="sidebar-import-hidden"
                action={navigateToImport}
              />
              {/* galadrim: inviting is an admin matter, as in Notion. */}
              {user.isAdmin && (
                <DismissableSidebarAction
                  id="sidebar-invite-hidden"
                  action={inviteUser}
                />
              )}
            </Section>
          </SidebarScrollProvider>
        </Scrollable>
      </DragActiveProvider>
      <HistoryNavigation />
    </Sidebar>
  );
}

const Overflow = styled.div`
  overflow: hidden;
  flex-shrink: 0;
`;

export default observer(AppSidebar);

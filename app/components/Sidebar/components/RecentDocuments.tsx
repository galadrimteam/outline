import { observer } from "mobx-react";
import { DocumentIcon } from "outline-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@shared/components/Icon";
import type Document from "~/models/Document";
import Flex from "~/components/Flex";
import useStores from "~/hooks/useStores";
import * as Scenes from "~/routes/scenes";
import { documentPath } from "~/utils/routeHelpers";
import Header from "./Header";
import Relative from "./Relative";
import SidebarLink from "./SidebarLink";

/** The number of recent documents Notion lists before its "More" row. */
const RECENT_DOCUMENTS_SHOWN = 5;

/** The number of recent documents listed once "Show more" was clicked. */
const RECENT_DOCUMENTS_EXPANDED = 15;

/**
 * galadrim: one row of Notion's "Recents" block – a flat link to a document,
 * with its emoji when it has one and the default page icon otherwise, like the
 * rows of the starred and shared sections.
 */
const RecentDocumentLink = observer(function RecentDocumentLink({
  document,
}: {
  document: Document;
}) {
  return (
    <SidebarLink
      to={documentPath(document)}
      icon={
        document.icon ? (
          <Icon
            value={document.icon}
            initial={document.initial}
            color={document.color ?? undefined}
          />
        ) : (
          <DocumentIcon outline={document.isDraft} />
        )
      }
      label={document.titleWithDefault}
      isDraft={document.isDraft}
      onClickIntent={Scenes.Document.preload}
      depth={0}
    />
  );
});

/**
 * galadrim: Notion's "Recents" block, the first list of its sidebar. The
 * documents come from the store, which the sidebar fills on mount (see
 * AppSidebar). The section hides itself while the list is empty, as Notion
 * does.
 */
function RecentDocuments() {
  const { documents } = useStores();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const recentlyViewed = documents.recentlyViewed;
  const shown = recentlyViewed.slice(
    0,
    expanded ? RECENT_DOCUMENTS_EXPANDED : RECENT_DOCUMENTS_SHOWN
  );

  if (!shown.length) {
    return null;
  }

  return (
    <Flex column>
      <Header id="recent" title={t("Recents")}>
        <Relative>
          {shown.map((document) => (
            <RecentDocumentLink key={document.id} document={document} />
          ))}
          {!expanded && recentlyViewed.length > shown.length && (
            <SidebarLink
              onClick={() => setExpanded(true)}
              label={`${t("Show more")}…`}
              depth={0}
            />
          )}
        </Relative>
      </Header>
    </Flex>
  );
}

export default observer(RecentDocuments);

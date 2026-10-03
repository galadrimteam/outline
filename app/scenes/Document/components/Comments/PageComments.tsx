import { observer } from "mobx-react";
import { transparentize } from "polished";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import useShare from "@shared/hooks/useShare";
import type Document from "~/models/Document";
import { pageDiscussions } from "~/components/Database/fields/pageLayout";
import { useDocumentContext } from "~/components/DocumentContext";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useCurrentUser from "~/hooks/useCurrentUser";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { DiscussionList } from "./DiscussionList";

interface Props {
  /** The page. */
  document: Document;
}

/**
 * The discussions of the page itself, under its title (and the properties of a database row),
 * like Notion's « Comments »: every open thread that is not anchored to a passage, folded to its
 * first and last comments from three replies on. The « Page discussions » of a row's database
 * decide the rest: expanded, the form that starts a discussion always follows; minimal (any other
 * page too), only the discussions there are show; off, nothing. A page asked through
 * `ui.setPageCommentsRequest` shows the form, focused, and scrolls to it. A thread replies in
 * place and a resolved one leaves the page; all of them stay in the sidebar.
 *
 * @param props the page.
 * @returns the discussions, or nothing when there are none to show.
 */
export const PageComments = observer(function PageComments_({
  document,
}: Props) {
  const { t } = useTranslation();
  const { comments, databases, ui } = useStores();
  const { anchoredCommentIds } = useDocumentContext();
  const user = useCurrentUser({ rejectOnEmpty: false });
  const team = useCurrentTeam({ rejectOnEmpty: false });
  const { isShare } = useShare();
  const can = usePolicy(document);
  const sectionRef = React.useRef<HTMLElement>(null);
  const [formKey, setFormKey] = React.useState(0);
  const database = document.databaseId
    ? databases.get(document.databaseId)
    : undefined;
  const mode = pageDiscussions(database?.settings?.pageLayout);

  // anchors are only known once an editor holds the document
  const enabled =
    mode !== "off" &&
    !!user &&
    !isShare &&
    !!team?.commentingEnabled &&
    !!anchoredCommentIds;
  const threads =
    enabled && anchoredCommentIds
      ? comments.pageThreadsInDocument(document.id, anchoredCommentIds)
      : [];
  const canStart = enabled && !!can.comment;
  const showForm = canStart && (mode === "expanded" || formKey > 0);
  const request = ui.pageCommentsRequest;
  const requested =
    !!request &&
    (request === document.id || request === document.databaseRecordId);

  React.useEffect(() => {
    if (!requested || !enabled) {
      return;
    }
    ui.setPageCommentsRequest(null);
    if (canStart) {
      setFormKey((key) => key + 1);
    }
  }, [requested, enabled, canStart, ui]);

  React.useEffect(() => {
    if (formKey > 0) {
      sectionRef.current?.scrollIntoView({ block: "center" });
    }
  }, [formKey]);

  if (!threads.length && !showForm) {
    return null;
  }

  return (
    <Section ref={sectionRef} aria-label={t("Comments")}>
      <Heading>{t("Comments")}</Heading>
      <DiscussionList
        document={document}
        threads={threads}
        fold
        showForm={showForm}
        formKey={formKey}
      />
    </Section>
  );
});

const Section = styled.section`
  margin-top: 22px;
  scroll-margin: 80px;
`;

/** Notion's label of the page discussions: small, medium weight, its text colour at 65 %. */
const Heading = styled.h2`
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  line-height: 24px;
  color: ${(props) => transparentize(0.35, props.theme.text)};
`;

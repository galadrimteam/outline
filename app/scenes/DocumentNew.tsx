import { observer } from "mobx-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation, useRouteMatch } from "react-router-dom";
import { toast } from "sonner";
import { UserPreference } from "@shared/types";
import { ProsemirrorDataHelper } from "@shared/utils/ProsemirrorDataHelper";
import CenteredContent from "~/components/CenteredContent";
import { resolvePrivateCollection } from "~/components/Sidebar/hooks/usePrivateCollection";
import Flex from "~/components/Flex";
import PlaceholderDocument from "~/components/PlaceholderDocument";
import useCurrentUser from "~/hooks/useCurrentUser";
import useQuery from "~/hooks/useQuery";
import useStores from "~/hooks/useStores";
import { preloadEditor } from "~/routes/scenes";
import { documentEditPath, documentPath } from "~/utils/routeHelpers";

function DocumentNew() {
  const history = useHistory();
  const location = useLocation();
  const query = useQuery();
  const user = useCurrentUser();
  const match = useRouteMatch<{ collectionSlug?: string }>();
  const { t } = useTranslation();
  const {
    documents,
    collections,
    memberships,
    userMemberships,
    groupMemberships,
    policies,
  } = useStores();
  const id = match.params.collectionSlug || query.get("collectionId");

  useEffect(() => {
    // Download the editor while the document is being created on the server
    preloadEditor();

    async function createDocument() {
      const index = parseInt(query.get("index") || "0", 10);
      const parentDocumentId = query.get("parentDocumentId") ?? undefined;
      const parentDocument = parentDocumentId
        ? documents.get(parentDocumentId)
        : undefined;
      let collection;

      try {
        if (id) {
          collection = await collections.fetch(id);
        } else if (!parentDocumentId) {
          // galadrim: like a new page in Notion, a document that is not filed
          // anywhere is published to the member's private collection ("Privé"
          // in the sidebar) rather than left as an unfiled draft. Members
          // without such a collection keep the upstream behaviour.
          // A failed lookup is *not* swallowed: it would silently produce an
          // unfiled draft instead, so the same click would land the page in
          // two different places depending on the network. It falls through to
          // the catch below, which asks the member to try again.
          const privateCollection = await resolvePrivateCollection(
            { collections, memberships, groupMemberships },
            user.id,
            user.name
          );

          if (
            privateCollection &&
            policies.abilities(privateCollection.id).createDocument
          ) {
            collection = privateCollection;
          }
        }

        const document = await documents.create(
          {
            collectionId: collection?.id,
            parentDocumentId,
            fullWidth:
              parentDocument?.fullWidth ||
              user.getPreference(UserPreference.FullWidthDocuments),
            templateId: query.get("templateId") ?? undefined,
            title: query.get("title") ?? "",
            data: ProsemirrorDataHelper.getEmpty(),
          },
          {
            publish: collection?.id || parentDocumentId ? true : undefined,
            index,
          }
        );

        if (parentDocumentId) {
          userMemberships
            .getByDocumentId(document.id)
            ?.addDocument(document, parentDocumentId);

          groupMemberships
            .getByDocumentId(document.id)
            ?.addDocument(document, parentDocumentId);
        }

        history.replace(
          !user.separateEditMode
            ? documentPath(document)
            : documentEditPath(document),
          location.state
        );
      } catch (_err) {
        toast.error(t("Couldn’t create the document, try again?"));
        history.goBack();
      }
    }

    void createDocument();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Flex column auto>
      <CenteredContent>
        <PlaceholderDocument />
      </CenteredContent>
    </Flex>
  );
}

export default observer(DocumentNew);

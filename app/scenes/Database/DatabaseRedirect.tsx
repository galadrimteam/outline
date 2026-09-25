import { observer } from "mobx-react";
import * as React from "react";
import type { RouteComponentProps } from "react-router-dom";
import { useHistory } from "react-router-dom";
import CenteredContent from "~/components/CenteredContent";
import PlaceholderDocument from "~/components/PlaceholderDocument";
import useStores from "~/hooks/useStores";
import Error404 from "~/scenes/Errors/Error404";

type Props = RouteComponentProps<{ databaseId: string; recordId?: string }>;

/**
 * `/db/:id` leads to the page (or the collection) a database lives in, and
 * `/db/:id/row/:recordId` to the page of a row, created on first open. These
 * are the stable links other tools (Forest, the MCP) give to databases.
 */
export const DatabaseRedirect = observer(function DatabaseRedirect({
  match,
}: Props) {
  const history = useHistory();
  const { databases, databaseRecords, documents, collections } = useStores();
  const [notFound, setNotFound] = React.useState(false);
  const { databaseId, recordId } = match.params;

  React.useEffect(() => {
    let cancelled = false;

    async function resolve(): Promise<string> {
      if (recordId) {
        const document = await databaseRecords.open(databaseId, recordId);
        return document.path;
      }
      const database = await databases.fetch(databaseId);
      if (database.documentId) {
        const document = await documents.fetch(database.documentId);
        return document.path;
      }
      const collection = await collections.fetch(database.collectionId);
      return collection.path;
    }

    resolve()
      .then((path) => {
        if (!cancelled) {
          history.replace(path);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    databaseId,
    recordId,
    databases,
    databaseRecords,
    documents,
    collections,
    history,
  ]);

  if (notFound) {
    return <Error404 />;
  }

  return (
    <CenteredContent>
      <PlaceholderDocument />
    </CenteredContent>
  );
});

export default DatabaseRedirect;

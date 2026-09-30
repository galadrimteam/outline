import { observer } from "mobx-react";
import * as React from "react";
import type Collection from "~/models/Collection";
import { retryTransient } from "~/utils/retryTransient";

type Props = {
  enabled: boolean;
  collection: Collection;
  children: React.ReactNode;
};

function DocumentsLoader({ collection, enabled, children }: Props) {
  React.useEffect(() => {
    if (enabled) {
      // galadrim: a tree that failed to load while the server was busy would
      // otherwise show its placeholder until the page is reloaded.
      void retryTransient(() => collection.fetchDocuments()).catch(
        () => undefined
      );
    }
  }, [collection, enabled]);

  return <>{children}</>;
}

export default observer(DocumentsLoader);
